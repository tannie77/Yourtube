import DailyWatchUsage from "../Modals/DailyWatchUsage.js";
import { findPlan } from "../subscriptions/plans.js";
import { isActive } from "../subscriptions/state.js";

export function istDayKey(now = new Date()) {
  return new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

export function viewerPlan(subscription, now = new Date()) {
  return isActive(subscription, now) ? subscription.planId : "free";
}

export async function usageSnapshot(userId, subscription, now = new Date()) {
  const planId = viewerPlan(subscription, now);
  const limitMinutes = findPlan(planId).features.dailyWatchMinutes;
  const record = await DailyWatchUsage.findOne({ userId, dayKey: istDayKey(now) }).lean();
  const secondsReserved = record?.secondsReserved || 0;
  return {
    dayKey: istDayKey(now), planId, limitMinutes, secondsReserved,
    remainingSeconds: limitMinutes === null ? null : Math.max(0, limitMinutes * 60 - secondsReserved),
    method: "once-per-video clip-duration reservation",
  };
}

export async function reserveWatch(userId, video, subscription, now = new Date()) {
  const dayKey = istDayKey(now);
  const videoId = String(video._id);
  const limitMinutes = findPlan(viewerPlan(subscription, now)).features.dailyWatchMinutes;
  const seconds = Math.max(1, Math.ceil(video.durationSeconds || 0));
  const filter = { userId, dayKey };

  try {
    await DailyWatchUsage.updateOne(filter, { $setOnInsert: { secondsReserved: 0, videoIds: [] } }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }

  const reserved = await DailyWatchUsage.findOneAndUpdate(
    { ...filter, videoIds: { $ne: videoId }, ...(limitMinutes === null ? {} : { secondsReserved: { $lte: limitMinutes * 60 - seconds } }) },
    { $inc: { secondsReserved: seconds }, $addToSet: { videoIds: videoId } },
    { returnDocument: "after" },
  );
  if (reserved) return { allowed: true };
  const current = await DailyWatchUsage.findOne(filter).lean();
  return { allowed: current?.videoIds.includes(videoId) || false };
}
