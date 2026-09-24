import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import app from "../app.js";
import { uploadDirectory } from "../filehelp/filehelp.js";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mp4Header = Buffer.from([
  0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109,
  0, 0, 0, 0, 105, 115, 111, 109, 109, 112, 52, 50,
]);
let database;
let httpServer;
let baseUrl;
let uploadedPath;

before(async () => {
  database = await MongoMemoryServer.create({
    instance: { ip: "127.0.0.1" },
    binary: { downloadDir: path.join(serverDirectory, ".local-data", "binaries") },
  });
  await mongoose.connect(database.getUri("vidcircle_video_test"));
  httpServer = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  await mongoose.disconnect();
  if (database) await database.stop();
  if (uploadedPath) await unlink(uploadedPath).catch(() => {});
});

async function register(name) {
  const response = await fetch(`${baseUrl}/user/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      email: `${name.toLowerCase().replaceAll(" ", "-")}-${Date.now()}@example.test`,
      password: "local-password-123",
    }),
  });
  assert.equal(response.status, 201);
  return { user: (await response.json()).user, cookie: response.headers.get("set-cookie").split(";")[0] };
}

function upload({ cookie, title = "A local video", contents = mp4Header, type = "video/mp4", fields = {} }) {
  const form = new FormData();
  form.set("file", new Blob([contents], { type }), "sample.mp4");
  form.set("videotitle", title);
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return fetch(`${baseUrl}/video/upload`, {
    method: "POST",
    headers: cookie ? { cookie } : undefined,
    body: form,
  });
}

test("MP4 upload belongs to the signed-in channel and streams to another viewer", async () => {
  const owner = await register("Video owner");
  const viewer = await register("Video viewer");

  assert.equal((await upload({})).status, 401);
  assert.equal((await upload({ cookie: owner.cookie })).status, 403);

  const channel = await fetch(`${baseUrl}/user/update/${owner.user._id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: owner.cookie },
    body: JSON.stringify({ channelname: "Owner's channel", description: "Local video tests" }),
  });
  assert.equal(channel.status, 200);

  const wrongType = await upload({ cookie: owner.cookie, type: "text/plain" });
  assert.equal(wrongType.status, 400);
  const wrongHeader = await upload({ cookie: owner.cookie, contents: Buffer.from("not an mp4") });
  assert.equal(wrongHeader.status, 400);
  const blankTitle = await upload({ cookie: owner.cookie, title: "   " });
  assert.equal(blankTitle.status, 400);

  const created = await upload({
    cookie: owner.cookie,
    title: "  My first upload  ",
    fields: { uploader: viewer.user._id, videochanel: "Forged channel" },
  });
  assert.equal(created.status, 201);
  const { video } = await created.json();
  assert.equal(video.videotitle, "My first upload");
  assert.equal(video.uploader, owner.user._id);
  assert.equal(video.videochanel, "Owner's channel");
  assert.match(video.mediaUrl, /^\/uploads\/[a-f0-9-]+\.mp4$/);
  assert.equal(video.filepath, video.mediaUrl);
  uploadedPath = path.join(uploadDirectory, path.basename(video.mediaUrl));

  const library = await fetch(`${baseUrl}/video/getall`, { headers: { cookie: viewer.cookie } });
  assert.equal(library.status, 200);
  const records = await library.json();
  assert.equal(records.length, 1);
  assert.equal(records[0]._id, video._id);
  assert.equal(records[0].uploader, owner.user._id);

  const media = await fetch(`${baseUrl}${video.mediaUrl}`, { headers: { range: "bytes=0-11" } });
  assert.equal(media.status, 206);
  assert.match(media.headers.get("content-type"), /video\/mp4/);
  assert.deepEqual(Buffer.from(await media.arrayBuffer()), mp4Header.subarray(0, 12));
});
