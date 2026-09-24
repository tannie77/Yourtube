import mongoose from "mongoose";

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: "videofiles", required: true },
  recordId: { type: mongoose.Schema.Types.ObjectId, ref: "download_record", required: true },
  state: { type: String, enum: ["active", "completed"], required: true },
  startedAt: { type: Date, required: true },
  blockedUntil: { type: Date, default: null },
}, { timestamps: true });

schema.index({ userId: 1, videoId: 1 }, { unique: true });

export default mongoose.model("download_window", schema);
