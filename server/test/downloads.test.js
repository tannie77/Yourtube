import assert from "node:assert/strict";
import http from "node:http";
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
import DailyDownloadUsage from "../Modals/DailyDownloadUsage.js";
import DownloadRecord from "../Modals/DownloadRecord.js";
import DownloadWindow from "../Modals/DownloadWindow.js";
import { removeGeneratedAssets } from "../video/assets.js";
import { acquireDownloadWindow, downloadUsageSnapshot, finishDownload, recoverDownloads, reserveDownload } from "../video/download-usage.js";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);
const uploadedPaths = [];
let fixtureDirectory;
let freeSample;
let hdSample;
let database;
let httpServer;
let baseUrl;
let serial = 0;

before(async () => {
  fixtureDirectory = await mkdtemp(path.join(tmpdir(), "vidcircle-download-test-"));
  async function sample(size, name) {
    const file = path.join(fixtureDirectory, name);
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `color=c=green:s=${size}:d=2`, "-c:v", "mpeg4", "-q:v", "5", "-movflags", "+faststart", "-y", file], { timeout: 30000 });
    return readFile(file);
  }
  freeSample = await sample("854x480", "free.mp4");
  hdSample = await sample("1280x720", "hd.mp4");
  database = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" }, binary: { downloadDir: path.join(serverDirectory, ".local-data", "binaries") } });
  await mongoose.connect(database.getUri("vidcircle_download_test"));
  await DailyDownloadUsage.init();
  await DownloadWindow.init();
  httpServer = await new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
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
  serial += 1;
  const response = await fetch(`${baseUrl}/user/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, email: `download-${serial}@example.test`, password: "local-password-123" }),
  });
  assert.equal(response.status, 201);
  return { user: (await response.json()).user, cookie: response.headers.get("set-cookie").split(";")[0] };
}

async function createChannel(account) {
  const response = await fetch(`${baseUrl}/user/update/${account.user._id}`, {
    method: "PATCH", headers: { "content-type": "application/json", cookie: account.cookie },
    body: JSON.stringify({ channelname: "Download test channel", description: "Local files only" }),
  });
  assert.equal(response.status, 200);
}

async function upload(account, title, contents, accessPlan = "free") {
  const form = new FormData();
  form.set("file", new Blob([contents], { type: "video/mp4" }), "sample.mp4");
  form.set("videotitle", title);
  form.set("accessPlan", accessPlan);
  const response = await fetch(`${baseUrl}/video/upload`, { method: "POST", headers: { cookie: account.cookie }, body: form });
  assert.equal(response.status, 201);
  const video = (await response.json()).video;
  const stored = await Video.findById(video._id).lean();
  uploadedPaths.push(path.join(uploadDirectory, path.basename(stored.filepath)));
  return video;
}

function get(route, cookie, headers = {}) {
  return fetch(`${baseUrl}${route}`, { headers: { ...(cookie ? { cookie } : {}), ...headers } });
}

async function completedUsage(cookie, count) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const usage = await (await get("/video/downloads/usage/me", cookie)).json();
    if (usage.completed === count && usage.pending === 0) return usage;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Download usage did not reach ${count} completed transfers.`);
}

async function abortAfterFirstChunk(route, cookie) {
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    const request = http.get(`${baseUrl}${route}`, { headers: { cookie } }, (reply) => {
      if (reply.statusCode !== 200) return finish(new Error(`Expected a download stream, received ${reply.statusCode}.`));
      reply.once("data", () => { reply.destroy(); finish(); });
      reply.once("error", (error) => { if (error.code !== "ECONNRESET") finish(error); });
    });
    request.once("error", (error) => { if (error.code !== "ECONNRESET") finish(error); });
  });
}

test("one Free download succeeds, consumes its quota and leaves watch minutes untouched", async () => {
  const owner = await register("Download Owner");
  const viewer = await register("Free Viewer");
  await createChannel(owner);
  const video = await upload(owner, "Free download demo", freeSample);
  const otherFree = await upload(owner, "Another free demo", freeSample);
  const premium = await upload(owner, "Silver download demo", freeSample, "silver");
  const route = `/video/${video._id}/download`;

  assert.equal((await get(route)).status, 401);
  assert.equal((await get("/video/downloads/usage/me")).status, 401);
  assert.equal((await get("/video/downloads/me")).status, 401);
  assert.equal((await get("/video/not-an-id/download", viewer.cookie)).status, 404);
  assert.equal((await fetch(`${baseUrl}${route}`, { method: "HEAD", headers: { cookie: viewer.cookie } })).status, 405);
  assert.equal((await get(route, viewer.cookie, { range: "bytes=0-10" })).status, 400);
  assert.equal((await get(`/video/${premium._id}/download`, viewer.cookie)).status, 403);
  const starting = (await (await get("/video/downloads/usage/me", viewer.cookie)).json());
  assert.deepEqual({ planId: starting.planId, limit: starting.limit, remaining: starting.remaining }, { planId: "free", limit: 1, remaining: 1 });

  const download = await get(route, viewer.cookie, { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36" });
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-disposition"), /attachment/);
  assert.equal(download.headers.get("x-download-quality"), "480p");
  assert.match(download.headers.get("cache-control"), /no-store/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), freeSample);
  const after = await completedUsage(viewer.cookie, 1);
  assert.equal(after.remaining, 0);
  assert.equal(after.dayKey.length, 10);
  const duplicate = await get(route, viewer.cookie);
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, "DUPLICATE_DOWNLOAD_WINDOW");
  assert.equal((await get(`/video/${otherFree._id}/download`, viewer.cookie)).status, 429);
  assert.equal(await DownloadRecord.countDocuments({ userId: viewer.user._id, status: "completed" }), 1);
  const record = await DownloadRecord.findOne({ userId: viewer.user._id }).lean();
  assert.equal(record.videoId.toString(), video._id);
  assert.equal(record.planId, "free");
  assert.equal(record.fileSize, freeSample.length);
  assert.equal(record.videoTitle, "Free download demo");
  assert.equal(record.browser, "Chrome");
  assert.equal(record.device, "Mac computer");
  const historyResponse = await get("/video/downloads/me", viewer.cookie);
  assert.equal(historyResponse.status, 200);
  assert.match(historyResponse.headers.get("cache-control"), /no-store/);
  const history = await historyResponse.json();
  assert.equal(history.length, 1);
  assert.deepEqual({ title: history[0].title, status: history[0].status, quality: history[0].quality, fileSize: history[0].fileSize, browser: history[0].browser, device: history[0].device },
    { title: "Free download demo", status: "completed", quality: "480p", fileSize: freeSample.length, browser: "Chrome", device: "Mac computer" });
  assert.equal(history[0].thumbnailAvailable, true);
  assert.equal(history[0].videoAvailable, true);
  assert.equal(typeof history[0].startedAt, "string");
  assert.equal(history[0].userAgent, undefined);
  assert.deepEqual(await (await get("/video/downloads/me", owner.cookie)).json(), []);
  const thumbnailRoute = `/video/downloads/${history[0].id}/thumbnail`;
  assert.equal((await get(thumbnailRoute)).status, 401);
  assert.equal((await get(thumbnailRoute, owner.cookie)).status, 404);
  assert.equal((await get("/video/downloads/not-an-id/thumbnail", viewer.cookie)).status, 404);
  const thumbnail = await get(thumbnailRoute, viewer.cookie);
  assert.equal(thumbnail.status, 200);
  assert.match(thumbnail.headers.get("content-type"), /image\/jpeg/);
  assert.match(thumbnail.headers.get("cache-control"), /no-store/);
  assert.ok((await thumbnail.arrayBuffer()).byteLength > 0);
  await Video.deleteOne({ _id: video._id });
  const retained = await (await get("/video/downloads/me", viewer.cookie)).json();
  assert.equal(retained[0].title, "Free download demo");
  assert.equal(retained[0].videoAvailable, false);
  assert.equal(retained[0].thumbnailAvailable, false);
  assert.equal((await get(thumbnailRoute, viewer.cookie)).status, 404);
  assert.equal((await (await get("/video/usage/me", viewer.cookie)).json()).secondsReserved, 0);
});

test("Bronze gets three allowed-quality downloads, then expiry removes premium access", async () => {
  const owner = await register("HD Owner");
  const viewer = await register("Bronze Viewer");
  await createChannel(owner);
  const videos = [];
  for (let index = 1; index <= 3; index += 1) videos.push(await upload(owner, `Bronze HD demo ${index}`, hdSample, "bronze"));
  const extra = await upload(owner, "Extra Bronze demo", freeSample);
  await Subscription.create({ userId: viewer.user._id, planId: "bronze", billingCycle: "monthly", startedAt: new Date(), expiresAt: new Date(Date.now() + 86400000) });
  const route = `/video/${videos[0]._id}/download`;

  for (let index = 0; index < 3; index += 1) {
    const response = await get(`/video/${videos[index]._id}/download`, viewer.cookie);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-download-quality"), "720p");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), hdSample);
    const usage = await completedUsage(viewer.cookie, index + 1);
    assert.equal(usage.remaining, 2 - index);
  }
  assert.equal((await get(`/video/${extra._id}/download`, viewer.cookie)).status, 429);
  await Subscription.updateOne({ userId: viewer.user._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await get(route, viewer.cookie)).status, 403);
  const expiredUsage = (await (await get("/video/downloads/usage/me", viewer.cookie)).json());
  assert.equal(expiredUsage.planId, "free");
  assert.equal(expiredUsage.remaining, 0);
  const expiredHistory = await (await get("/video/downloads/me", viewer.cookie)).json();
  assert.equal(expiredHistory.length, 3);
  assert.ok(expiredHistory.every((entry) => entry.title.startsWith("Bronze HD demo") && entry.planId === "bronze" && entry.status === "completed"));
  assert.equal((await get(`/video/downloads/${expiredHistory[0].id}/thumbnail`, viewer.cookie)).status, 200);
});

test("a 30-minute same-video guard does not consume a second slot and expires", async () => {
  const owner = await register("Window Owner");
  const viewer = await register("Window Viewer");
  await createChannel(owner);
  const video = await upload(owner, "Window demo", freeSample);
  await Subscription.create({ userId: viewer.user._id, planId: "bronze", billingCycle: "monthly", startedAt: new Date(), expiresAt: new Date(Date.now() + 86400000) });
  const route = `/video/${video._id}/download`;

  const firstDownload = await get(route, viewer.cookie);
  assert.equal(firstDownload.status, 200);
  await firstDownload.arrayBuffer();
  await completedUsage(viewer.cookie, 1);
  const duplicate = await get(route, viewer.cookie);
  assert.equal(duplicate.status, 409);
  assert.ok(Number(duplicate.headers.get("retry-after")) > 0);
  assert.equal((await duplicate.json()).code, "DUPLICATE_DOWNLOAD_WINDOW");
  assert.equal((await (await get("/video/downloads/usage/me", viewer.cookie)).json()).remaining, 2);
  assert.equal(await DownloadRecord.countDocuments({ userId: viewer.user._id }), 1);

  await DownloadWindow.updateOne({ userId: viewer.user._id, videoId: video._id }, { $set: { blockedUntil: new Date(Date.now() - 1000) } });
  const afterWindow = await get(route, viewer.cookie);
  assert.equal(afterWindow.status, 200);
  await afterWindow.arrayBuffer();
  assert.equal((await completedUsage(viewer.cookie, 2)).remaining, 1);
  assert.equal(await DownloadRecord.countDocuments({ userId: viewer.user._id, status: "completed" }), 2);
});

test("simultaneous same-video and different-video requests cannot bypass a Free slot", async () => {
  const owner = await register("Parallel Owner");
  const sameViewer = await register("Parallel Same Viewer");
  const separateViewer = await register("Parallel Separate Viewer");
  await createChannel(owner);
  const first = await upload(owner, "Parallel first", freeSample);
  const second = await upload(owner, "Parallel second", freeSample);
  const firstRoute = `/video/${first._id}/download`;
  const secondRoute = `/video/${second._id}/download`;

  const same = await Promise.all([get(firstRoute, sameViewer.cookie), get(firstRoute, sameViewer.cookie)]);
  assert.deepEqual(same.map((response) => response.status).sort(), [200, 409]);
  await Promise.all(same.map((response) => response.arrayBuffer()));
  assert.equal((await completedUsage(sameViewer.cookie, 1)).remaining, 0);
  assert.equal(await DownloadRecord.countDocuments({ userId: sameViewer.user._id }), 1);

  const separate = await Promise.all([get(firstRoute, separateViewer.cookie), get(secondRoute, separateViewer.cookie)]);
  assert.deepEqual(separate.map((response) => response.status).sort(), [200, 429]);
  await Promise.all(separate.map((response) => response.arrayBuffer()));
  assert.equal((await completedUsage(separateViewer.cookie, 1)).remaining, 0);
  assert.equal(await DownloadRecord.countDocuments({ userId: separateViewer.user._id, status: "completed" }), 1);
});

test("an interrupted transfer releases its quota and same-video guard", async () => {
  const owner = await register("Interrupted Owner");
  const viewer = await register("Interrupted Viewer");
  await createChannel(owner);
  const paddedSample = Buffer.concat([freeSample, Buffer.alloc(16 * 1024 * 1024)]);
  const video = await upload(owner, "Interrupted demo", paddedSample);
  const route = `/video/${video._id}/download`;

  await abortAfterFirstChunk(route, viewer.cookie);
  let failed;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    failed = await DownloadRecord.findOne({ userId: viewer.user._id }).lean();
    const usage = await (await get("/video/downloads/usage/me", viewer.cookie)).json();
    if (failed?.status === "failed" && usage.pending === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(failed?.status, "failed");
  assert.ok(["connection_closed", "transfer_failed"].includes(failed.failureReason));
  assert.equal((await (await get("/video/downloads/usage/me", viewer.cookie)).json()).remaining, 1);
  assert.equal(await DownloadWindow.countDocuments({ userId: viewer.user._id }), 0);

  const retry = await get(route, viewer.cookie);
  assert.equal(retry.status, 200);
  assert.equal((await retry.arrayBuffer()).byteLength, paddedSample.length);
  assert.equal((await completedUsage(viewer.cookie, 1)).remaining, 0);
  assert.equal((await (await get("/video/downloads/me", viewer.cookie)).json()).length, 2);
});

test("startup recovery reconciles unfinished records, orphan slots and completed transfers", async () => {
  const owner = await register("Recovery Owner");
  const interruptedViewer = await register("Recovery Interrupted Viewer");
  const orphanViewer = await register("Recovery Orphan Viewer");
  const completedViewer = await register("Recovery Completed Viewer");
  await createChannel(owner);
  const video = await upload(owner, "Recovery demo", freeSample);

  const interruptedId = new mongoose.Types.ObjectId();
  assert.equal((await acquireDownloadWindow(interruptedViewer.user._id, video._id, interruptedId)).allowed, true);
  const interruptedSlot = await reserveDownload(interruptedViewer.user._id, null);
  assert.equal(interruptedSlot.allowed, true);
  await DownloadRecord.create({
    _id: interruptedId, userId: interruptedViewer.user._id, videoId: video._id, videoTitle: "Recovery demo",
    dayKey: interruptedSlot.dayKey, planId: "free", quality: "480p", fileSize: freeSample.length,
  });
  assert.equal((await reserveDownload(orphanViewer.user._id, null)).allowed, true);

  const completedId = new mongoose.Types.ObjectId();
  assert.equal((await acquireDownloadWindow(completedViewer.user._id, video._id, completedId)).allowed, true);
  const completedSlot = await reserveDownload(completedViewer.user._id, null);
  assert.equal(completedSlot.allowed, true);
  await DownloadRecord.create({
    _id: completedId, userId: completedViewer.user._id, videoId: video._id, videoTitle: "Recovery demo",
    dayKey: completedSlot.dayKey, planId: "free", quality: "480p", fileSize: freeSample.length,
    status: "completed", finishedAt: new Date(),
  });

  const recovery = await recoverDownloads();
  assert.ok(recovery.failedRecords >= 1);
  assert.equal((await DownloadRecord.findById(interruptedId).lean()).failureReason, "server_restart");
  assert.equal((await downloadUsageSnapshot(interruptedViewer.user._id, null)).remaining, 1);
  assert.equal((await downloadUsageSnapshot(orphanViewer.user._id, null)).remaining, 1);
  assert.equal((await downloadUsageSnapshot(completedViewer.user._id, null)).remaining, 0);
  assert.equal(await DownloadWindow.countDocuments({ userId: interruptedViewer.user._id }), 0);
  const restoredGuard = await acquireDownloadWindow(completedViewer.user._id, video._id, new mongoose.Types.ObjectId());
  assert.equal(restoredGuard.allowed, false);
  assert.ok(restoredGuard.retryAt > new Date());
  await recoverDownloads();
  assert.equal((await downloadUsageSnapshot(completedViewer.user._id, null)).completed, 1);
  assert.equal((await DownloadRecord.findById(interruptedId).lean()).status, "failed");
});

test("concurrent reservations obey the Free limit and reset at IST midnight", async () => {
  const viewer = await register("Midnight Viewer");
  const beforeMidnight = new Date("2026-09-24T18:29:59.000Z");
  const afterMidnight = new Date("2026-09-24T18:30:00.000Z");
  const attempts = await Promise.all(Array.from({ length: 12 }, () => reserveDownload(viewer.user._id, null, beforeMidnight)));
  assert.equal(attempts.filter((attempt) => attempt.allowed).length, 1);
  await finishDownload(attempts.find((attempt) => attempt.allowed), true);
  assert.equal((await downloadUsageSnapshot(viewer.user._id, null, beforeMidnight)).remaining, 0);
  assert.equal((await reserveDownload(viewer.user._id, null, beforeMidnight)).allowed, false);

  const nextDay = await reserveDownload(viewer.user._id, null, afterMidnight);
  assert.equal(nextDay.allowed, true);
  assert.notEqual(nextDay.dayKey, attempts[0].dayKey);
  assert.equal((await downloadUsageSnapshot(viewer.user._id, null, afterMidnight)).remaining, 0);
  await finishDownload(nextDay, false);
  assert.equal((await downloadUsageSnapshot(viewer.user._id, null, afterMidnight)).remaining, 1);
});
