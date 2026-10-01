import mongoose from "mongoose";
import { planIds } from "../subscriptions/plans.js";
const videoschema = mongoose.Schema(
  {
    videotitle: { type: String, required: true },
    filename: { type: String, required: true },
    filetype: { type: String, required: true },
    filepath: { type: String, required: true },
    filesize: { type: Number, required: true },
    videochanel: { type: String, required: true },
    Like: { type: Number, default: 0 },
    Dislike: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    uploader: { type: String, required: true },
    accessPlan: { type: String, enum: planIds, default: "free" },
    width: { type: Number },
    height: { type: Number },
    durationSeconds: { type: Number },
    sourceQuality: { type: String, enum: ["480p", "720p", "1080p", "4K"] },
    renditions: [{ quality: { type: String, enum: ["480p", "720p", "1080p", "4K"] }, filename: String }],
    captionFilename: { type: String, default: null },
    previewCount: { type: Number, default: 0 },
    earlyAccessUntil: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("videofiles", videoschema);
