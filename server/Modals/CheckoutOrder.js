import mongoose from "mongoose";
import { billingCycles, paidPlanIds } from "../subscriptions/plans.js";

const simulatedResultSchema = new mongoose.Schema({
  outcome: { type: String, enum: ["success", "failure", "cancel"], required: true },
  paymentId: { type: String, required: true },
  signature: { type: String, required: true },
  issuedAt: { type: Date, required: true },
}, { _id: false });

const checkoutOrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
  idempotencyKey: { type: String, required: true },
  intent: { type: String, enum: ["purchase", "renewal", "upgrade", "downgrade"], default: "purchase" },
  fromPlanId: { type: String, enum: paidPlanIds },
  fromExpiresAt: { type: Date },
  planId: { type: String, enum: paidPlanIds, required: true },
  billingCycle: { type: String, enum: billingCycles.map((cycle) => cycle.id), required: true },
  amountPaise: { type: Number, required: true, min: 1 },
  currency: { type: String, default: "INR", enum: ["INR"] },
  status: { type: String, enum: ["pending", "processing", "paid", "failed", "cancelled"], default: "pending" },
  verificationSecret: { type: String, required: true, select: false },
  simulatedResult: { type: simulatedResultSchema, default: undefined },
  processingAt: { type: Date },
  paymentId: { type: String },
  invoiceNumber: { type: String },
  paidAt: { type: Date },
  termStartsAt: { type: Date },
  termExpiresAt: { type: Date },
  receiptStatus: { type: String, enum: ["pending", "sending", "sent", "failed"] },
  receiptAttempts: { type: Number, default: 0 },
  receiptClaimedAt: { type: Date },
  receiptSentAt: { type: Date },
  failureReason: { type: String },
}, { timestamps: true });

checkoutOrderSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
checkoutOrderSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("checkoutOrder", checkoutOrderSchema);
