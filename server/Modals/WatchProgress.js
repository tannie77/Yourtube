import mongoose from "mongoose";

const watchProgressSchema = new mongoose.Schema({
  viewer: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  videoid: { type: mongoose.Schema.Types.ObjectId, ref: "videofiles", required: true },
  positionSeconds: { type: Number, default: 0, min: 0 },
  watchedSeconds: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

watchProgressSchema.index({ viewer: 1, videoid: 1 }, { unique: true });

export default mongoose.model("watchprogress", watchProgressSchema);
