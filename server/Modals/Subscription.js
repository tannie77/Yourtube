import mongoose from "mongoose";
import { billingCycles, paidPlanIds } from "../subscriptions/plans.js";

const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, unique: true },
  planId: { type: String, enum: paidPlanIds, required: true },
  billingCycle: { type: String, enum: billingCycles.map((cycle) => cycle.id), required: true },
  startedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  provider: { type: String, enum: ["local", "razorpay"], default: "local" },
  razorpaySubscriptionId: { type: String },
  autoRenew: { type: Boolean, default: false },
  nextRenewalAt: { type: Date },
  pendingProviderChange: {
    planId: { type: String, enum: paidPlanIds },
    billingCycle: { type: String, enum: billingCycles.map((cycle) => cycle.id) },
    requestedAt: Date,
    startsAt: Date,
  },
  lastOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "checkoutOrder" },
  scheduledChange: {
    planId: { type: String, enum: paidPlanIds },
    billingCycle: { type: String, enum: billingCycles.map((cycle) => cycle.id) },
    startsAt: { type: Date },
    expiresAt: { type: Date },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "checkoutOrder" },
  },
}, { timestamps: true });

subscriptionSchema.index({ razorpaySubscriptionId: 1 }, { unique: true, partialFilterExpression: { razorpaySubscriptionId: { $type: "string" } } });

export default mongoose.model("subscription", subscriptionSchema);
