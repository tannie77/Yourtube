import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import app from "../app.js";
import Video from "../Modals/video.js";
import Like from "../Modals/like.js";
import WatchLater from "../Modals/watchlater.js";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let database;
let httpServer;
let baseUrl;
let serial = 0;

before(async () => {
  database = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" }, binary: { downloadDir: path.join(serverDirectory, ".local-data", "binaries") } });
  await mongoose.connect(database.getUri("yourtube2_library_test"));
  await Promise.all([Like.init(), WatchLater.init()]);
  httpServer = await new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  await mongoose.disconnect();
  if (database) await database.stop();
});

async function register(name) {
  serial += 1;
  const response = await fetch(`${baseUrl}/user/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, email: `library-${serial}@example.test`, password: "local-password-123" }),
  });
  assert.equal(response.status, 201);
  return { user: (await response.json()).user, cookie: response.headers.get("set-cookie").split(";")[0] };
}

function request(route, cookie, method = "GET", body) {
  return fetch(`${baseUrl}${route}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test("Liked videos and Watch later use the session, keep counters stable, and return safe viewer-aware lists", async () => {
  const owner = await register("Library owner");
  const viewer = await register("Library viewer");
  const free = await Video.create({
    videotitle: "Free library sample", filename: "secret-source.mp4", filetype: "video/mp4",
    filepath: "/uploads/secret-source.mp4", filesize: 1000, videochanel: "Library owner",
    uploader: owner.user._id, sourceQuality: "480p", durationSeconds: 60,
    captionFilename: "secret-captions.vtt", renditions: [{ quality: "480p", filename: "secret-variant.mp4" }],
  });
  const premium = await Video.create({
    videotitle: "Silver library sample", filename: "premium.mp4", filetype: "video/mp4",
    filepath: "/uploads/premium.mp4", filesize: 1000, videochanel: "Library owner",
    uploader: owner.user._id, sourceQuality: "480p", durationSeconds: 60, accessPlan: "silver",
  });
  const freeId = String(free._id);
  const premiumId = String(premium._id);

  assert.equal((await request("/likes/me")).status, 401);
  assert.equal((await request(`/likes/${freeId}`, null, "PUT")).status, 401);
  assert.equal((await request("/watch-later/me")).status, 401);
  assert.equal((await request(`/watch-later/${freeId}`, null, "PUT")).status, 401);
  assert.equal((await request(`/likes/${owner.user._id}`, viewer.cookie)).status, 404);
  assert.equal((await request(`/watch-later/${owner.user._id}`, viewer.cookie)).status, 404);
  assert.equal((await request("/likes/not-an-id", viewer.cookie, "PUT")).status, 404);
  assert.equal((await request(`/watch-later/${new mongoose.Types.ObjectId()}`, viewer.cookie, "PUT")).status, 404);

  const liked = await request(`/likes/${freeId}`, viewer.cookie, "PUT", { userId: owner.user._id });
  assert.deepEqual(await liked.json(), { liked: true, likes: 1 });
  assert.deepEqual(await (await request(`/likes/${freeId}`, viewer.cookie, "PUT")).json(), { liked: true, likes: 1 });
  assert.equal(await Like.countDocuments({ viewer: viewer.user._id, videoid: free._id }), 1);
  assert.equal(await Like.countDocuments({ viewer: owner.user._id }), 0);
  assert.deepEqual(await (await request("/likes/me", owner.cookie)).json(), []);
  const likedList = await request("/likes/me", viewer.cookie);
  assert.match(likedList.headers.get("cache-control"), /no-store/);
  const [likedEntry] = await likedList.json();
  assert.equal(likedEntry.video._id, freeId);
  assert.equal(likedEntry.video.likedByViewer, true);
  assert.equal(likedEntry.video.filepath, `/video/${freeId}/media`);
  assert.equal(likedEntry.video.captionFilename, undefined);
  assert.equal(likedEntry.video.renditions, undefined);

  const saved = await request(`/watch-later/${premiumId}`, viewer.cookie, "PUT", { userId: owner.user._id });
  assert.deepEqual(await saved.json(), { savedForLater: true });
  assert.deepEqual(await (await request(`/watch-later/${premiumId}`, viewer.cookie, "PUT")).json(), { savedForLater: true });
  assert.equal(await WatchLater.countDocuments({ viewer: viewer.user._id, videoid: premium._id }), 1);
  assert.deepEqual(await (await request("/watch-later/me", owner.cookie)).json(), []);
  const [savedEntry] = await (await request("/watch-later/me", viewer.cookie)).json();
  assert.equal(savedEntry.video._id, premiumId);
  assert.equal(savedEntry.video.canWatch, false);
  assert.equal(savedEntry.video.savedForLater, true);
  assert.equal(savedEntry.video.filepath, `/video/${premiumId}/media`);

  const viewerFeed = await (await request("/video/getall", viewer.cookie)).json();
  assert.deepEqual(viewerFeed.find((item) => item._id === freeId).likedByViewer, true);
  assert.deepEqual(viewerFeed.find((item) => item._id === premiumId).savedForLater, true);
  const ownerFeed = await (await request("/video/getall", owner.cookie)).json();
  assert.equal(ownerFeed.find((item) => item._id === freeId).likedByViewer, false);
  assert.equal(ownerFeed.find((item) => item._id === premiumId).savedForLater, false);

  assert.deepEqual(await (await request(`/likes/${freeId}`, owner.cookie, "DELETE")).json(), { liked: false, likes: 1 });
  assert.deepEqual(await (await request(`/watch-later/${premiumId}`, owner.cookie, "DELETE")).json(), { savedForLater: false });
  assert.equal(await Like.countDocuments({ viewer: viewer.user._id, videoid: free._id }), 1);
  assert.equal(await WatchLater.countDocuments({ viewer: viewer.user._id, videoid: premium._id }), 1);
  assert.deepEqual(await (await request(`/likes/${freeId}`, viewer.cookie, "DELETE")).json(), { liked: false, likes: 0 });
  assert.deepEqual(await (await request(`/likes/${freeId}`, viewer.cookie, "DELETE")).json(), { liked: false, likes: 0 });
  assert.deepEqual(await (await request(`/watch-later/${premiumId}`, viewer.cookie, "DELETE")).json(), { savedForLater: false });
  assert.deepEqual(await (await request(`/watch-later/${premiumId}`, viewer.cookie, "DELETE")).json(), { savedForLater: false });
  assert.deepEqual(await (await request("/likes/me", viewer.cookie)).json(), []);
  assert.deepEqual(await (await request("/watch-later/me", viewer.cookie)).json(), []);
});
