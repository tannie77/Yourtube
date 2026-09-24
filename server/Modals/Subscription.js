import mongoose from "mongoose";
import { billingCycles, paidPlanIds } from "../subscriptions/plans.js";

const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, unique: true },
  planId: { type: String, enum: paidPlanIds, required: true },
  billingCycle: { type: String, enum: billingCycles.map((cycle) => cycle.id), required: true },
  startedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  lastOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "checkoutOrder" },
}, { timestamps: true });

export default mongoose.model("subscription", subscriptionSchema);
