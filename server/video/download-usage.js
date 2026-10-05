import DailyDownloadUsage from "../Modals/DailyDownloadUsage.js";
import MonthlyDownloadUsage from "../Modals/MonthlyDownloadUsage.js";
import DownloadRecord from "../Modals/DownloadRecord.js";
import DownloadWindow from "../Modals/DownloadWindow.js";
import { findPlan } from "../subscriptions/plans.js";
import { istDayKey, viewerPlan } from "./usage.js";

export const DUPLICATE_DOWNLOAD_WINDOW_MS = 30 * 60 * 1000;

async function reservePeriod(Model, key, limit) {
  try {
    await Model.updateOne(key, { $setOnInsert: { completedCount: 0, reservedCount: 0 } }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  return Model.findOneAndUpdate(
    { ...key, $expr: { $lt: [{ $add: ["$completedCount", "$reservedCount"] }, limit] } },
    { $inc: { reservedCount: 1 } },
    { returnDocument: "after" },
  );
}

async function settlePeriod(Model, key, completed) {
  return Model.updateOne(
    { ...key, reservedCount: { $gte: 1 } },
    completed ? { $inc: { reservedCount: -1, completedCount: 1 } } : { $inc: { reservedCount: -1 } },
  );
}

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
  const monthKey = dayKey.slice(0, 7);
  const planId = viewerPlan(subscription, now);
  const { dailyDownloads: limit, monthlyDownloads: monthlyLimit } = findPlan(planId).features;
  const [record, monthRecord] = await Promise.all([
    DailyDownloadUsage.findOne({ userId, dayKey }).lean(),
    MonthlyDownloadUsage.findOne({ userId, monthKey }).lean(),
  ]);
  const completed = record?.completedCount || 0;
  const pending = record?.reservedCount || 0;
  const monthlyCompleted = monthRecord?.completedCount || 0;
  const monthlyPending = monthRecord?.reservedCount || 0;
  const dailyRemaining = Math.max(0, limit - completed - pending);
  const monthlyRemaining = Math.max(0, monthlyLimit - monthlyCompleted - monthlyPending);
  return { dayKey, monthKey, planId, limit, completed, pending, dailyRemaining,
    monthlyLimit, monthlyCompleted, monthlyPending, monthlyRemaining,
    remaining: Math.min(dailyRemaining, monthlyRemaining) };
}

export async function reserveDownload(userId, subscription, now = new Date()) {
  const dayKey = istDayKey(now);
  const monthKey = dayKey.slice(0, 7);
  const planId = viewerPlan(subscription, now);
  const { dailyDownloads: limit, monthlyDownloads: monthlyLimit } = findPlan(planId).features;
  const day = { userId, dayKey };
  const month = { userId, monthKey };
  const reservedDay = await reservePeriod(DailyDownloadUsage, day, limit);
  if (!reservedDay) return { allowed: false, reason: "daily", userId, dayKey, monthKey, planId, limit, monthlyLimit };
  try {
    const reservedMonth = await reservePeriod(MonthlyDownloadUsage, month, monthlyLimit);
    if (reservedMonth) return { allowed: true, userId, dayKey, monthKey, planId, limit, monthlyLimit };
    await settlePeriod(DailyDownloadUsage, day, false);
    return { allowed: false, reason: "monthly", userId, dayKey, monthKey, planId, limit, monthlyLimit };
  } catch (error) {
    await settlePeriod(DailyDownloadUsage, day, false);
    throw error;
  }
}

export async function finishDownload(reservation, completed) {
  const [daily, monthly] = await Promise.all([
    settlePeriod(DailyDownloadUsage, { userId: reservation.userId, dayKey: reservation.dayKey }, completed),
    settlePeriod(MonthlyDownloadUsage, { userId: reservation.userId, monthKey: reservation.monthKey }, completed),
  ]);
  return { matchedCount: Math.min(daily.matchedCount, monthly.matchedCount) };
}

export async function recoverDownloads(now = new Date()) {
  const failed = await DownloadRecord.updateMany(
    { status: "reserved" },
    { $set: { status: "failed", failureReason: "server_restart", finishedAt: now } },
  );

  await DailyDownloadUsage.updateMany({}, { $set: { completedCount: 0, reservedCount: 0 } });
  await MonthlyDownloadUsage.updateMany({}, { $set: { completedCount: 0, reservedCount: 0 } });
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
  const months = new Map();
  for (const count of counts) {
    const monthKey = count._id.dayKey.slice(0, 7);
    const key = `${count._id.userId}:${monthKey}`;
    const previous = months.get(key);
    months.set(key, { userId: count._id.userId, monthKey,
      completedCount: (previous?.completedCount || 0) + count.completedCount });
  }
  for (const month of months.values()) {
    await MonthlyDownloadUsage.updateOne(
      { userId: month.userId, monthKey: month.monthKey },
      { $set: { completedCount: month.completedCount, reservedCount: 0 } },
      { upsert: true },
    );
  }

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
  return { failedRecords: failed.modifiedCount, rebuiltDays: counts.length, rebuiltMonths: months.size, restoredWindows: restored.size };
}
