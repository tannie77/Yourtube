import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import DailyDownloadUsage from "../Modals/DailyDownloadUsage.js";
import MonthlyDownloadUsage from "../Modals/MonthlyDownloadUsage.js";
import { downloadUsageSnapshot, finishDownload, reserveDownload } from "../video/download-usage.js";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let database;

before(async () => {
  database = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" }, binary: { downloadDir: path.join(serverDirectory, ".local-data", "binaries") } });
  await mongoose.connect(database.getUri("yourtube2_download_usage_test"));
  await Promise.all([DailyDownloadUsage.init(), MonthlyDownloadUsage.init()]);
});

after(async () => {
  await mongoose.disconnect();
  if (database) await database.stop();
});

test("concurrent reservations enforce the monthly quota and reset at IST month boundary", async () => {
  const userId = new mongoose.Types.ObjectId();
  const subscription = { planId: "bronze", expiresAt: new Date("2026-11-01T00:00:00Z") };
  const beforeMidnight = new Date("2026-09-30T18:29:59Z");
  const afterMidnight = new Date("2026-09-30T18:30:00Z");
  await MonthlyDownloadUsage.create({ userId, monthKey: "2026-09", completedCount: 59, reservedCount: 0 });
  const results = await Promise.all(Array.from({ length: 12 }, () => reserveDownload(userId, subscription, beforeMidnight)));
  assert.equal(results.filter((item) => item.allowed).length, 1);
  assert.ok(results.some((item) => item.reason === "monthly"));
  await finishDownload(results.find((item) => item.allowed), true);
  const september = await downloadUsageSnapshot(userId, subscription, beforeMidnight);
  assert.equal(september.monthKey, "2026-09");
  assert.equal(september.monthlyCompleted, 60);
  assert.equal(september.monthlyRemaining, 0);
  assert.equal(september.remaining, 0);
  const october = await downloadUsageSnapshot(userId, subscription, afterMidnight);
  assert.equal(october.monthKey, "2026-10");
  assert.equal(october.monthlyRemaining, 60);
  assert.equal(october.dailyRemaining, 3);
  const next = await reserveDownload(userId, subscription, afterMidnight);
  assert.equal(next.allowed, true);
  await finishDownload(next, false);
  assert.equal((await downloadUsageSnapshot(userId, subscription, afterMidnight)).monthlyRemaining, 60);
});
