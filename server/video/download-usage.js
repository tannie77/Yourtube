import DailyDownloadUsage from "../Modals/DailyDownloadUsage.js";
import DownloadRecord from "../Modals/DownloadRecord.js";
import DownloadWindow from "../Modals/DownloadWindow.js";
import { findPlan } from "../subscriptions/plans.js";
import { istDayKey, viewerPlan } from "./usage.js";

export const DUPLICATE_DOWNLOAD_WINDOW_MS = 30 * 60 * 1000;

// A unique user/video row admits only one active transfer or one recent success.
export async function acquireDownloadWindow(userId, videoId, recordId, now = new Date()) {
  const key = { userId, videoId };
  const reset = { recordId, state: "active", startedAt: now, blockedUntil: null };
  const reused = await DownloadWindow.findOneAndUpdate(
    { ...key, state: "completed", blockedUntil: { $lte: now } },
    { $set: reset },
    { returnDocument: "after" },
  );
  if (reused) return { allowed: true, ...key, recordId };

  try {
    await DownloadWindow.create({ ...key, ...reset });
    return { allowed: true, ...key, recordId };
  } catch (error) {
    if (error.code !== 11000) throw error;
    const current = await DownloadWindow.findOne(key).lean();
    return { allowed: false, retryAt: current?.state === "completed" ? current.blockedUntil : null };
  }
}

export async function settleDownloadWindow(window, completed, now = new Date()) {
  const filter = { userId: window.userId, videoId: window.videoId, recordId: window.recordId, state: "active" };
  if (!completed) return DownloadWindow.deleteOne(filter);
  return DownloadWindow.updateOne(filter, {
    $set: { state: "completed", blockedUntil: new Date(now.getTime() + DUPLICATE_DOWNLOAD_WINDOW_MS) },
  });
}

export async function downloadUsageSnapshot(userId, subscription, now = new Date()) {
  const dayKey = istDayKey(now);
  const planId = viewerPlan(subscription, now);
  const limit = findPlan(planId).features.dailyDownloads;
  const record = await DailyDownloadUsage.findOne({ userId, dayKey }).lean();
  const completed = record?.completedCount || 0;
  const pending = record?.reservedCount || 0;
  return { dayKey, planId, limit, completed, pending, remaining: Math.max(0, limit - completed - pending) };
}

export async function reserveDownload(userId, subscription, now = new Date()) {
  const dayKey = istDayKey(now);
  const planId = viewerPlan(subscription, now);
  const limit = findPlan(planId).features.dailyDownloads;
  const key = { userId, dayKey };

  try {
    await DailyDownloadUsage.updateOne(key, { $setOnInsert: { completedCount: 0, reservedCount: 0 } }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }

  const reserved = await DailyDownloadUsage.findOneAndUpdate(
    { ...key, $expr: { $lt: [{ $add: ["$completedCount", "$reservedCount"] }, limit] } },
    { $inc: { reservedCount: 1 } },
    { returnDocument: "after" },
  );
  return { allowed: Boolean(reserved), userId, dayKey, planId, limit };
}

export async function finishDownload(reservation, completed) {
  const update = completed
    ? { $inc: { reservedCount: -1, completedCount: 1 } }
    : { $inc: { reservedCount: -1 } };
  return DailyDownloadUsage.updateOne(
    { userId: reservation.userId, dayKey: reservation.dayKey, reservedCount: { $gte: 1 } },
    update,
  );
}

// Run before app.listen, when no download transfers are active in this API process.
export async function recoverDownloads(now = new Date()) {
  const failed = await DownloadRecord.updateMany(
    { status: "reserved" },
    { $set: { status: "failed", failureReason: "server_restart", finishedAt: now } },
  );

  // Completed records are durable; counters can be rebuilt after a crash at any point
  // between reserving, recording the outcome and updating the daily total.
  await DailyDownloadUsage.updateMany({}, { $set: { completedCount: 0, reservedCount: 0 } });
  const counts = await DownloadRecord.aggregate([
    { $match: { status: "completed" } },
    { $group: { _id: { userId: "$userId", dayKey: "$dayKey" }, completedCount: { $sum: 1 } } },
  ]);
  for (const count of counts) {
    await DailyDownloadUsage.updateOne(
      { userId: count._id.userId, dayKey: count._id.dayKey },
      { $set: { completedCount: count.completedCount, reservedCount: 0 } },
      { upsert: true },
    );
  }

  // Failed or record-less attempts lose their lock. Recent completed transfers
  // regain the remainder of their 30-minute window, including pre-5C records.
  await DownloadWindow.deleteMany({ state: "active" });
  const cutoff = new Date(now.getTime() - DUPLICATE_DOWNLOAD_WINDOW_MS);
  const recent = await DownloadRecord.find({ status: "completed", finishedAt: { $gt: cutoff } })
    .sort({ finishedAt: -1 }).select("userId videoId finishedAt createdAt").lean();
  const restored = new Set();
  for (const record of recent) {
    const key = `${record.userId}:${record.videoId}`;
    if (restored.has(key)) continue;
    restored.add(key);
    await DownloadWindow.updateOne(
      { userId: record.userId, videoId: record.videoId },
      { $set: {
        recordId: record._id, state: "completed", startedAt: record.createdAt,
        blockedUntil: new Date(record.finishedAt.getTime() + DUPLICATE_DOWNLOAD_WINDOW_MS),
      } },
      { upsert: true },
    );
  }
  return { failedRecords: failed.modifiedCount, rebuiltDays: counts.length, restoredWindows: restored.size };
}
