import mongoose from "mongoose";

const schema = new mongoose.Schema({
  commentId: { type: mongoose.Schema.Types.ObjectId, ref: "comment", required: true },
  reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  reason: { type: String, enum: ["spam", "harassment", "offensive"], required: true },
  reportedText: { type: String, required: true },
  reportedRevision: { type: Number, required: true },
  status: { type: String, enum: ["pending", "dismissed", "removed"], default: "pending" },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ commentId: 1, reporterId: 1 }, { unique: true });
schema.index({ status: 1, createdAt: 1 });

export default mongoose.model("comment_report", schema);
