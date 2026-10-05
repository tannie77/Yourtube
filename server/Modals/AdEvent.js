import mongoose from "mongoose";

const adEventSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "adcampaign", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: "video", required: true },
  day: { type: String, required: true },
  kind: { type: String, enum: ["impression", "click"], required: true },
}, { timestamps: true });

adEventSchema.index({ campaignId: 1, userId: 1, videoId: 1, day: 1, kind: 1 }, { unique: true });
export default mongoose.model("adevent", adEventSchema);
