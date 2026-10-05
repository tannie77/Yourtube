import mongoose from "mongoose";

const adCampaignSchema = new mongoose.Schema({
  key: { type: String, unique: true, sparse: true },
  sponsor: { type: String, required: true, maxlength: 80 },
  headline: { type: String, required: true, maxlength: 100 },
  description: { type: String, required: true, maxlength: 240 },
  cta: { type: String, required: true, maxlength: 32 },
  destination: { type: String, required: true, maxlength: 500 },
  active: { type: Boolean, default: true },
  startsAt: { type: Date, default: Date.now },
  endsAt: { type: Date, default: null },
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
}, { timestamps: true });

adCampaignSchema.index({ active: 1, startsAt: 1, endsAt: 1 });
export default mongoose.model("adcampaign", adCampaignSchema);
