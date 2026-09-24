import mongoose from "mongoose";
import { planIds } from "../subscriptions/plans.js";

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: "videofiles", required: true },
  videoTitle: { type: String, default: "" },
  dayKey: { type: String, required: true },
  planId: { type: String, enum: planIds, required: true },
  quality: { type: String, enum: ["480p", "720p", "1080p", "4K"], required: true },
  fileSize: { type: Number, required: true, min: 0 },
  ip: { type: String, default: "" },
  userAgent: { type: String, default: "" },
  browser: { type: String, default: "" },
  device: { type: String, default: "" },
  status: { type: String, enum: ["reserved", "completed", "failed"], default: "reserved" },
  failureReason: { type: String, enum: ["connection_closed", "transfer_failed", "server_restart"], default: null },
  finishedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("download_record", schema);
