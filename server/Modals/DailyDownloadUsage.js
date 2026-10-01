import mongoose from "mongoose";

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  dayKey: { type: String, required: true },
  completedCount: { type: Number, default: 0, min: 0 },
  reservedCount: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

schema.index({ userId: 1, dayKey: 1 }, { unique: true });

export default mongoose.model("daily_download_usage", schema);
