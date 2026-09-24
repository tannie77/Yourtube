import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import app from "../app.js";
import { uploadDirectory } from "../filehelp/filehelp.js";
import Video from "../Modals/video.js";
import Subscription from "../Modals/Subscription.js";
import DailyWatchUsage from "../Modals/DailyWatchUsage.js";
import WatchProgress from "../Modals/WatchProgress.js";
import { istDayKey } from "../video/usage.js";
import { removeGeneratedAssets } from "../video/assets.js";
import { probeVideo } from "../video/metadata.js";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);
let mp4Sample;
let hdSample;
let fixtureDirectory;
let database;
let httpServer;
let baseUrl;
const uploadedPaths = [];

before(async () => {
  fixtureDirectory = await mkdtemp(path.join(tmpdir(), "vidcircle-video-test-"));
  async function sample(size, name) {
    const file = path.join(fixtureDirectory, name);
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `color=c=blue:s=${size}:d=2`, "-c:v", "mpeg4", "-q:v", "5", "-movflags", "+faststart", "-y", file], { timeout: 30000 });
    return readFile(file);
  }
  mp4Sample = await sample("854x480", "standard.mp4");
  hdSample = await sample("1280x720", "hd.mp4");
  database = await MongoMemoryServer.create({
    instance: { ip: "127.0.0.1" },
    binary: { downloadDir: path.join(serverDirectory, ".local-data", "binaries") },
  });
  await mongoose.connect(database.getUri("vidcircle_video_test"));
  await DailyWatchUsage.init();
  await WatchProgress.init();
  httpServer = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  await mongoose.disconnect();
  if (database) await database.stop();
  await Promise.all(uploadedPaths.map((filePath) => unlink(filePath).catch(() => {})));
  await Promise.all(uploadedPaths.map((filePath) => removeGeneratedAssets(path.basename(filePath, ".mp4"))));
  if (fixtureDirectory) await rm(fixtureDirectory, { recursive: true, force: true });
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

async function buyPlan(cookie, planId, key) {
  const created = await fetch(`${baseUrl}/subscriptions/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ planId, billingCycle: "monthly", idempotencyKey: key }),
  });
  assert.equal(created.status, 201);
  const { order } = await created.json();
  const simulated = await fetch(`${baseUrl}/subscriptions/orders/${order.orderId}/simulate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ outcome: "success" }),
  });
  assert.equal(simulated.status, 200);
  const { result } = await simulated.json();
  const verified = await fetch(`${baseUrl}/subscriptions/orders/${order.orderId}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(result),
  });
  assert.equal(verified.status, 200);
}

function upload({ cookie, title = "A local video", contents = mp4Sample, type = "video/mp4", fields = {}, captions = null }) {
  const form = new FormData();
  form.set("file", new Blob([contents], { type }), "sample.mp4");
  if (captions) form.set("captions", new Blob([captions], { type: "text/vtt" }), "captions.vtt");
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
  const badPlan = await upload({ cookie: owner.cookie, fields: { accessPlan: "founder" } });
  assert.equal(badPlan.status, 400);
  const fakeHeader = await upload({ cookie: owner.cookie, contents: Buffer.from([0, 0, 0, 12, 102, 116, 121, 112, 0, 0, 0, 0]) });
  assert.equal(fakeHeader.status, 400);

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
  assert.match(video.mediaUrl, new RegExp(`^/video/${video._id}/media$`));
  assert.equal(video.filepath, video.mediaUrl);
  assert.equal(video.accessPlan, "free");
  assert.equal(video.canWatch, true);
  assert.equal(video.sourceQuality, "480p");
  assert.ok(video.durationSeconds > 0);
  const stored = await Video.findById(video._id).lean();
  uploadedPaths.push(path.join(uploadDirectory, path.basename(stored.filepath)));

  assert.equal((await fetch(`${baseUrl}/video/getall`)).status, 401);
  assert.equal((await fetch(`${baseUrl}${video.mediaUrl}`)).status, 401);
  assert.equal((await fetch(`${baseUrl}${stored.filepath}`, { headers: { cookie: viewer.cookie } })).status, 404);

  const library = await fetch(`${baseUrl}/video/getall`, { headers: { cookie: viewer.cookie } });
  assert.equal(library.status, 200);
  const records = await library.json();
  assert.equal(records.length, 1);
  assert.equal(records[0]._id, video._id);
  assert.equal(records[0].uploader, owner.user._id);
  assert.equal(records[0].canWatch, true);

  const media = await fetch(`${baseUrl}${video.mediaUrl}`, { headers: { cookie: viewer.cookie, range: "bytes=0-11" } });
  assert.equal(media.status, 206);
  assert.match(media.headers.get("content-type"), /video\/mp4/);
  assert.match(media.headers.get("cache-control"), /no-store/);
  assert.deepEqual(Buffer.from(await media.arrayBuffer()), mp4Sample.subarray(0, 12));
  const usage = await fetch(`${baseUrl}/video/usage/me`, { headers: { cookie: viewer.cookie } });
  assert.equal(usage.status, 200);
  const secondsAfterFirstPlay = (await usage.json()).secondsReserved;
  assert.ok(secondsAfterFirstPlay > 0);
  assert.equal((await fetch(`${baseUrl}${video.mediaUrl}`, { headers: { cookie: viewer.cookie, range: "bytes=0-11" } })).status, 206);
  assert.equal((await (await fetch(`${baseUrl}/video/usage/me`, { headers: { cookie: viewer.cookie } })).json()).secondsReserved, secondsAfterFirstPlay);

  const premiumUpload = await upload({ cookie: owner.cookie, title: "Silver preview", fields: { accessPlan: "silver" } });
  assert.equal(premiumUpload.status, 201);
  const premium = (await premiumUpload.json()).video;
  assert.equal(premium.accessPlan, "silver");
  assert.equal(premium.canWatch, true);
  const premiumStored = await Video.findById(premium._id).lean();
  uploadedPaths.push(path.join(uploadDirectory, path.basename(premiumStored.filepath)));

  const freeLibrary = await fetch(`${baseUrl}/video/getall`, { headers: { cookie: viewer.cookie } });
  const freePremium = (await freeLibrary.json()).find((item) => item._id === premium._id);
  assert.equal(freePremium.accessPlan, "silver");
  assert.equal(freePremium.canWatch, false);
  const locked = await fetch(`${baseUrl}${premium.mediaUrl}`, { headers: { cookie: viewer.cookie, range: "bytes=0-11" } });
  assert.equal(locked.status, 403);
  assert.equal((await locked.json()).code, "PLAN_REQUIRED");
  assert.equal((await fetch(`${baseUrl}${premium.mediaUrl}`, { headers: { cookie: owner.cookie, range: "bytes=0-11" } })).status, 206);

  await buyPlan(viewer.cookie, "bronze", "video_bronze_001");
  assert.equal((await fetch(`${baseUrl}${premium.mediaUrl}`, { headers: { cookie: viewer.cookie } })).status, 403);
  await buyPlan(viewer.cookie, "silver", "video_silver_001");
  const unlocked = await fetch(`${baseUrl}${premium.mediaUrl}`, { headers: { cookie: viewer.cookie, range: "bytes=0-11" } });
  assert.equal(unlocked.status, 206);
  assert.deepEqual(Buffer.from(await unlocked.arrayBuffer()), mp4Sample.subarray(0, 12));

  const beforeExpiryHistory = await fetch(`${baseUrl}/video/history/me`, { headers: { cookie: viewer.cookie } });
  assert.equal(beforeExpiryHistory.status, 200);
  assert.equal((await beforeExpiryHistory.json()).length, 2);
  assert.equal((await fetch(`${baseUrl}/video/history/me`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/history/${viewer.user._id}`, { headers: { cookie: owner.cookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/history/${viewer.user._id}`, { headers: { cookie: viewer.cookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/history/${viewer.user._id}`, { method: "POST", headers: { cookie: viewer.cookie } })).status, 410);

  await Subscription.updateOne({ userId: viewer.user._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await fetch(`${baseUrl}${premium.mediaUrl}`, { headers: { cookie: viewer.cookie, range: "bytes=0-11" } })).status, 403);
  const expiredLibrary = await fetch(`${baseUrl}/video/getall`, { headers: { cookie: viewer.cookie } });
  assert.equal((await expiredLibrary.json()).find((item) => item._id === premium._id).canWatch, false);
  const afterExpiryHistory = await fetch(`${baseUrl}/video/history/me`, { headers: { cookie: viewer.cookie } });
  assert.equal(afterExpiryHistory.status, 200);
  assert.equal((await afterExpiryHistory.json()).length, 2);
});

test("local quality variants, early access, local ads and daily allowance follow the current plan", async () => {
  const owner = await register("Rules owner");
  const viewer = await register("Rules viewer");
  await fetch(`${baseUrl}/user/update/${owner.user._id}`, {
    method: "PATCH", headers: { "content-type": "application/json", cookie: owner.cookie },
    body: JSON.stringify({ channelname: "Rules channel" }),
  });

  const hdUpload = await upload({ cookie: owner.cookie, title: "HD source", contents: hdSample });
  assert.equal(hdUpload.status, 201);
  const hd = (await hdUpload.json()).video;
  assert.equal(hd.sourceQuality, "720p");
  assert.equal(hd.accessPlan, "free");
  assert.deepEqual(hd.qualityOptions.map(({ quality, allowed }) => ({ quality, allowed })), [{ quality: "480p", allowed: true }, { quality: "720p", allowed: true }]);
  uploadedPaths.push(path.join(uploadDirectory, path.basename((await Video.findById(hd._id).lean()).filepath)));
  const freeHd = await fetch(`${baseUrl}/video/getall`, { headers: { cookie: viewer.cookie } });
  const freeHdEntry = (await freeHd.json()).find((item) => item._id === hd._id);
  assert.equal(freeHdEntry.canWatch, true);
  assert.deepEqual(freeHdEntry.qualityOptions.map(({ quality, allowed }) => ({ quality, allowed })), [{ quality: "480p", allowed: true }, { quality: "720p", allowed: false }]);
  const hdStored = await Video.findById(hd._id).lean();
  const lowerFilename = hdStored.renditions.find((item) => item.quality === "480p").filename;
  assert.equal((await probeVideo(path.join(uploadDirectory, lowerFilename))).sourceQuality, "480p");
  const freeVariant = await fetch(`${baseUrl}${hd.mediaUrl}?quality=480p`, { headers: { cookie: viewer.cookie, range: "bytes=0-11" } });
  assert.equal(freeVariant.status, 206);
  assert.equal((await fetch(`${baseUrl}${hd.mediaUrl}?quality=720p`, { headers: { cookie: viewer.cookie, range: "bytes=0-11" } })).status, 403);
  assert.equal((await fetch(`${baseUrl}${hd.mediaUrl}?quality=bogus`, { headers: { cookie: viewer.cookie } })).status, 400);

  const earlyUpload = await upload({ cookie: owner.cookie, title: "Early release", fields: { earlyAccess: "true" } });
  assert.equal(earlyUpload.status, 201);
  const early = (await earlyUpload.json()).video;
  assert.equal(early.earlyAccessActive, true);
  assert.equal(early.accessPlan, "gold");
  uploadedPaths.push(path.join(uploadDirectory, path.basename((await Video.findById(early._id).lean()).filepath)));
  await buyPlan(viewer.cookie, "bronze", "rules_bronze_001");
  const bronzeLibrary = await fetch(`${baseUrl}/video/getall`, { headers: { cookie: viewer.cookie } });
  const bronzeEntries = await bronzeLibrary.json();
  assert.equal(bronzeEntries.find((item) => item._id === hd._id).canWatch, true);
  assert.equal(bronzeEntries.find((item) => item._id === hd._id).qualityOptions.at(-1).allowed, true);
  assert.equal((await fetch(`${baseUrl}${hd.mediaUrl}?quality=720p`, { headers: { cookie: viewer.cookie, range: "bytes=0-11" } })).status, 206);
  assert.equal(bronzeEntries.find((item) => item._id === early._id).canWatch, false);
  assert.equal(bronzeEntries.find((item) => item._id === hd._id).showLocalAd, true);
  await buyPlan(viewer.cookie, "gold", "rules_gold_001");
  const goldEntries = await (await fetch(`${baseUrl}/video/getall`, { headers: { cookie: viewer.cookie } })).json();
  assert.equal(goldEntries.find((item) => item._id === early._id).canWatch, true);
  assert.equal(goldEntries.find((item) => item._id === early._id).showLocalAd, false);

  await Video.updateOne({ _id: early._id }, { $set: { earlyAccessUntil: new Date(Date.now() - 1000) } });
  await Subscription.updateOne({ userId: viewer.user._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const afterWindow = await (await fetch(`${baseUrl}/video/getall`, { headers: { cookie: viewer.cookie } })).json();
  assert.equal(afterWindow.find((item) => item._id === early._id).accessPlan, "free");
  assert.equal(afterWindow.find((item) => item._id === early._id).canWatch, true);
  assert.equal(afterWindow.find((item) => item._id === early._id).showLocalAd, true);
  assert.equal((await fetch(`${baseUrl}${hd.mediaUrl}?quality=720p`, { headers: { cookie: viewer.cookie, range: "bytes=0-11" } })).status, 403);
  assert.equal((await fetch(`${baseUrl}${hd.mediaUrl}?quality=480p`, { headers: { cookie: viewer.cookie, range: "bytes=0-11" } })).status, 206);

  await Video.updateOne({ _id: early._id }, { $set: { durationSeconds: 3601 } });
  const limit = await fetch(`${baseUrl}${early.mediaUrl}`, { headers: { cookie: viewer.cookie, range: "bytes=0-11" } });
  assert.equal(limit.status, 429);
  assert.equal((await limit.json()).code, "WATCH_LIMIT_REACHED");
  assert.equal((await fetch(`${baseUrl}/video/history/me`, { headers: { cookie: viewer.cookie } })).status, 200);
});

test("uploaded captions and preview frames stay private and follow video access", async () => {
  const owner = await register("Caption owner");
  const viewer = await register("Caption viewer");
  await fetch(`${baseUrl}/user/update/${owner.user._id}`, {
    method: "PATCH", headers: { "content-type": "application/json", cookie: owner.cookie },
    body: JSON.stringify({ channelname: "Caption channel" }),
  });
  const invalid = await upload({ cookie: owner.cookie, captions: "not webvtt" });
  assert.equal(invalid.status, 400);
  const captionText = "WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nA local caption\n";
  const response = await upload({ cookie: owner.cookie, title: "Caption sample", captions: captionText, fields: { accessPlan: "silver" } });
  assert.equal(response.status, 201);
  const { video } = await response.json();
  const stored = await Video.findById(video._id).lean();
  uploadedPaths.push(path.join(uploadDirectory, path.basename(stored.filepath)));
  uploadedPaths.push(path.join(uploadDirectory, stored.captionFilename));
  assert.equal(video.hasCaptions, true);
  assert.ok(video.previewCount > 0);
  assert.equal(video.captionFilename, undefined);
  assert.equal(video.renditions, undefined);
  assert.equal((await fetch(`${baseUrl}/video/${video._id}/captions`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/video/${video._id}/preview/0`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/video/${video._id}/captions`, { headers: { cookie: viewer.cookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/video/${video._id}/preview/0`, { headers: { cookie: viewer.cookie } })).status, 403);
  const captionResponse = await fetch(`${baseUrl}/video/${video._id}/captions`, { headers: { cookie: owner.cookie } });
  assert.equal(captionResponse.status, 200);
  assert.match(captionResponse.headers.get("content-type"), /text\/vtt/);
  assert.equal(await captionResponse.text(), captionText);
  const previewResponse = await fetch(`${baseUrl}/video/${video._id}/preview/0`, { headers: { cookie: owner.cookie } });
  assert.equal(previewResponse.status, 200);
  assert.match(previewResponse.headers.get("content-type"), /image\/jpeg/);
  assert.ok((await previewResponse.arrayBuffer()).byteLength > 100);
  assert.equal((await fetch(`${baseUrl}/video/${video._id}/preview/${video.previewCount}`, { headers: { cookie: owner.cookie } })).status, 404);
  await buyPlan(viewer.cookie, "silver", "caption_silver_001");
  assert.equal((await fetch(`${baseUrl}/video/${video._id}/captions`, { headers: { cookie: viewer.cookie } })).status, 200);
});

test("watch reservations reset at IST midnight", () => {
  assert.equal(istDayKey(new Date("2026-09-23T18:29:59Z")), "2026-09-23");
  assert.equal(istDayKey(new Date("2026-09-23T18:30:00Z")), "2026-09-24");
});

test("saved watch position is private, resumes across requests and completes at the configured threshold", async () => {
  const owner = await register("Progress owner");
  const viewer = await register("Progress viewer");
  const other = await register("Other viewer");
  const channel = await fetch(`${baseUrl}/user/update/${owner.user._id}`, {
    method: "PATCH", headers: { "content-type": "application/json", cookie: owner.cookie },
    body: JSON.stringify({ channelname: "Progress channel" }),
  });
  assert.equal(channel.status, 200);
  const uploaded = await upload({ cookie: owner.cookie, title: "Resume sample" });
  assert.equal(uploaded.status, 201);
  const { video } = await uploaded.json();
  uploadedPaths.push(path.join(uploadDirectory, path.basename((await Video.findById(video._id).lean()).filepath)));
  const endpoint = `${baseUrl}/video/${video._id}/progress`;
  const headers = { "content-type": "application/json", cookie: viewer.cookie };

  assert.equal((await fetch(endpoint)).status, 401);
  assert.equal((await fetch(`${baseUrl}/video/not-an-id/progress`, { headers })).status, 404);
  const initial = await fetch(endpoint, { headers });
  assert.equal(initial.status, 200);
  assert.match(initial.headers.get("cache-control"), /no-store/);
  assert.deepEqual((({ positionSeconds, completed, completionPercent }) => ({ positionSeconds, completed, completionPercent }))(await initial.json()), {
    positionSeconds: 0, completed: false, completionPercent: 90,
  });
  const invalid = await fetch(endpoint, { method: "PUT", headers, body: JSON.stringify({ positionSeconds: -1 }) });
  assert.equal(invalid.status, 400);
  const missing = await fetch(endpoint, { method: "PUT", headers, body: JSON.stringify({}) });
  assert.equal(missing.status, 400);
  const invalidWatched = await fetch(endpoint, { method: "PUT", headers, body: JSON.stringify({ positionSeconds: 1, watchedSecondsDelta: -1 }) });
  assert.equal(invalidWatched.status, 400);
  const saved = await fetch(endpoint, {
    method: "PUT", headers,
    body: JSON.stringify({ positionSeconds: video.durationSeconds * 0.4, watchedSecondsDelta: 0 }),
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).completed, false);
  const resumed = await (await fetch(endpoint, { headers })).json();
  assert.ok(Math.abs(resumed.positionSeconds - video.durationSeconds * 0.4) < 0.01);
  assert.equal((await (await fetch(endpoint, { headers: { cookie: other.cookie } })).json()).positionSeconds, 0);
  const skipped = await fetch(endpoint, {
    method: "PUT", headers,
    body: JSON.stringify({ positionSeconds: video.durationSeconds * 0.95, watchedSecondsDelta: 0 }),
  });
  assert.equal(skipped.status, 200);
  assert.equal((await skipped.json()).completed, false);

  const previousThreshold = process.env.WATCH_COMPLETE_PERCENT;
  process.env.WATCH_COMPLETE_PERCENT = "75";
  try {
    const partial = await fetch(endpoint, {
      method: "PUT", headers,
      body: JSON.stringify({ positionSeconds: video.durationSeconds * 0.5, watchedSecondsDelta: video.durationSeconds * 0.4 }),
    });
    assert.equal(partial.status, 200);
    assert.equal((await partial.json()).completed, false);
    const finished = await fetch(endpoint, {
      method: "PUT", headers,
      body: JSON.stringify({ positionSeconds: video.durationSeconds * 0.9, watchedSecondsDelta: video.durationSeconds * 0.4 }),
    });
    assert.equal(finished.status, 200);
    assert.equal((await finished.json()).completed, true);
    const replayed = await fetch(endpoint, { method: "PUT", headers, body: JSON.stringify({ positionSeconds: 0, watchedSecondsDelta: 0 }) });
    assert.equal(replayed.status, 200);
    assert.equal((await replayed.json()).completed, true);
    assert.ok((await (await fetch(endpoint, { headers })).json()).watchedSeconds >= video.durationSeconds * 0.8);
    assert.equal((await WatchProgress.countDocuments({ viewer: viewer.user._id, videoid: video._id })), 1);
  } finally {
    if (previousThreshold === undefined) delete process.env.WATCH_COMPLETE_PERCENT;
    else process.env.WATCH_COMPLETE_PERCENT = previousThreshold;
  }

  const lockedUpload = await upload({ cookie: owner.cookie, title: "Locked progress", fields: { accessPlan: "silver" } });
  assert.equal(lockedUpload.status, 201);
  const lockedVideo = (await lockedUpload.json()).video;
  uploadedPaths.push(path.join(uploadDirectory, path.basename((await Video.findById(lockedVideo._id).lean()).filepath)));
  assert.equal((await fetch(`${baseUrl}/video/${lockedVideo._id}/progress`, { headers })).status, 403);
  assert.equal((await fetch(`${baseUrl}/video/${lockedVideo._id}/progress`, { method: "PUT", headers, body: JSON.stringify({ positionSeconds: 1, watchedSecondsDelta: 1 }) })).status, 403);
});
