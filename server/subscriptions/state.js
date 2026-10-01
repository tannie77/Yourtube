import Subscription from "../Modals/Subscription.js";
import { billingCycles, plans } from "./plans.js";

export const DAY_MS = 24 * 60 * 60 * 1000;

export function termLength(cycleId) {
  return billingCycles.find((cycle) => cycle.id === cycleId)?.validityDays * DAY_MS;
}

export function isActive(record, now = new Date()) {
  return Boolean(record && record.expiresAt > now);
}

export function orderIntent(record, planId, now = new Date()) {
  if (!isActive(record, now)) return "purchase";
  const currentRank = plans.findIndex((plan) => plan.id === record.planId);
  const nextRank = plans.findIndex((plan) => plan.id === planId);
  if (nextRank === currentRank) return "renewal";
  return nextRank > currentRank ? "upgrade" : "downgrade";
}

export async function readSubscription(userId, now = new Date()) {
  const record = await Subscription.findOne({ userId });
  const change = record?.scheduledChange;
  if (!change?.orderId || change.startsAt > now) return record;

  const updated = await Subscription.findOneAndUpdate(
    { _id: record._id, "scheduledChange.orderId": change.orderId, expiresAt: record.expiresAt },
    {
      $set: {
        planId: change.planId,
        billingCycle: change.billingCycle,
        startedAt: change.startsAt,
        expiresAt: change.expiresAt,
        lastOrderId: change.orderId,
      },
      $unset: { scheduledChange: 1 },
    },
    { returnDocument: "after" },
  );
  return updated || Subscription.findOne({ userId });
}

export function publicSubscription(record, userId, now = new Date()) {
  const active = isActive(record, now);
  const change = active && record.scheduledChange?.orderId ? record.scheduledChange : null;
  return {
    userId: userId.toString(),
    effectivePlanId: active ? record.planId : "free",
    status: active ? "active" : record ? "expired" : "free",
    billingCycle: active ? record.billingCycle : null,
    startedAt: active ? record.startedAt : null,
    expiresAt: active ? record.expiresAt : null,
    remainingDays: active ? Math.ceil((record.expiresAt - now) / DAY_MS) : 0,
    scheduledChange: change ? {
      planId: change.planId,
      billingCycle: change.billingCycle,
      startsAt: change.startsAt,
      expiresAt: change.expiresAt,
    } : null,
    accessEndsAt: active ? (change?.expiresAt || record.expiresAt) : null,
    cancelAtPeriodEnd: active ? record.cancelAtPeriodEnd : false,
    autoRenew: false,
  };
}
