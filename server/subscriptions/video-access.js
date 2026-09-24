import { findPlan, planIds } from "./plans.js";
import { qualityOrder } from "../video/assets.js";
import { isActive } from "./state.js";

const qualityPlan = { "480p": "free", "720p": "bronze", "1080p": "silver", "4K": "gold" };

export function isEarlyAccess(video, now = new Date()) {
  return Boolean(video.earlyAccessUntil && new Date(video.earlyAccessUntil) > now);
}

export function requiredVideoPlan(video, now = new Date()) {
  const required = video.accessPlan ?? "free";
  if (!planIds.includes(required)) return null;
  if (isEarlyAccess(video, now)) return "gold";
  const lowestQuality = video.renditions?.length ? video.renditions[0].quality : video.sourceQuality;
  const qualityRequired = qualityPlan[lowestQuality] || "free";
  return planIds[Math.max(planIds.indexOf(required), planIds.indexOf(qualityRequired))];
}

export function canWatchVideo(video, user, subscription, now = new Date()) {
  const required = requiredVideoPlan(video, now);
  if (!required) return false;
  if (String(video.uploader) === String(user._id)) return true;
  const activePlan = isActive(subscription, now) ? subscription.planId : "free";
  return planIds.indexOf(activePlan) >= planIds.indexOf(required);
}

export function availableQualities(video, user, subscription, now = new Date()) {
  const entries = video.renditions?.length ? video.renditions : [{ quality: video.sourceQuality, filename: null }];
  const owner = String(video.uploader) === String(user._id);
  const activePlan = isActive(subscription, now) ? subscription.planId : "free";
  const maximum = findPlan(activePlan)?.features.maxQuality || "480p";
  return entries.filter((entry) => qualityOrder.includes(entry.quality)).map((entry) => ({
    quality: entry.quality,
    filename: entry.filename,
    allowed: owner || qualityOrder.indexOf(entry.quality) <= qualityOrder.indexOf(maximum),
    requiredPlanId: qualityPlan[entry.quality],
  }));
}

export function showLocalAd(subscription, now = new Date()) {
  const activePlan = isActive(subscription, now) ? subscription.planId : "free";
  return !findPlan(activePlan).features.adFree;
}
