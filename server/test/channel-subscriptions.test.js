import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import app from "../app.js";
import User from "../Modals/Auth.js";
import Video from "../Modals/video.js";
import ChannelSubscription from "../Modals/ChannelSubscription.js";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let database;
let httpServer;
let baseUrl;
let serial = 0;

before(async () => {
  database = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" }, binary: { downloadDir: path.join(serverDirectory, ".local-data", "binaries") } });
  await mongoose.connect(database.getUri("yourtube2_channel_subscriptions_test"));
  await ChannelSubscription.init();
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
    body: JSON.stringify({ name, email: `channel-${serial}@example.test`, password: "local-password-123" }),
  });
  assert.equal(response.status, 201);
  return { user: (await response.json()).user, cookie: response.headers.get("set-cookie").split(";")[0] };
}

function request(route, cookie, method = "GET") {
  return fetch(`${baseUrl}${route}`, { method, headers: cookie ? { cookie } : {} });
}

test("channel subscriptions are private, idempotent, and populate the signed-in video feed", async () => {
  const creator = await register("Creator");
  const secondCreator = await register("Second creator");
  const viewer = await register("Viewer");
  await User.updateOne({ _id: creator.user._id }, { $set: { channelname: "Creator channel" } });
  await User.updateOne({ _id: secondCreator.user._id }, { $set: { channelname: "Other channel" } });
  const ownVideo = await Video.create({
    videotitle: "Subscribed video", filename: "sample.mp4", filetype: "video/mp4", filepath: "/uploads/sample.mp4",
    filesize: 1000, videochanel: "Creator channel", uploader: creator.user._id,
    sourceQuality: "480p", durationSeconds: 30,
  });
  await Video.create({
    videotitle: "Other video", filename: "other.mp4", filetype: "video/mp4", filepath: "/uploads/other.mp4",
    filesize: 1000, videochanel: "Other channel", uploader: secondCreator.user._id,
    sourceQuality: "480p", durationSeconds: 30,
  });

  assert.equal((await request("/channels/subscriptions/me")).status, 401);
  assert.equal((await request(`/channels/${creator.user._id}/subscription`, creator.cookie, "PUT")).status, 403);
  assert.equal((await request(`/channels/${viewer.user._id}/subscription`, creator.cookie, "PUT")).status, 404);
  assert.equal((await request("/channels/not-an-id/subscription", viewer.cookie, "PUT")).status, 404);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await request(`/channels/${creator.user._id}/subscription`, viewer.cookie, "PUT");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { subscribed: true, subscriberCount: 1 });
  }
  assert.equal(await ChannelSubscription.countDocuments({ subscriber: viewer.user._id }), 1);
  const feedResponse = await request("/channels/subscriptions/me", viewer.cookie);
  assert.equal(feedResponse.status, 200);
  assert.match(feedResponse.headers.get("cache-control"), /no-store/);
  const feed = await feedResponse.json();
  assert.deepEqual(feed.channels.map((channel) => channel.channelname), ["Creator channel"]);
  assert.equal(feed.channels[0].email, undefined);
  assert.deepEqual(feed.videos.map((video) => video._id), [String(ownVideo._id)]);
  assert.equal(feed.videos[0].filepath, `/video/${ownVideo._id}/media`);
  assert.equal(feed.videos[0].filename, "sample.mp4");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await request(`/channels/${creator.user._id}/subscription`, viewer.cookie, "DELETE");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { subscribed: false, subscriberCount: 0 });
  }
  assert.deepEqual((await (await request("/channels/subscriptions/me", viewer.cookie)).json()).videos, []);
});
