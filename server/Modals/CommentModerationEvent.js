import mongoose from "mongoose";

const schema = new mongoose.Schema({
  commentId: { type: mongoose.Schema.Types.ObjectId, ref: "comment", required: true },
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: "comment_report", required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  decision: { type: String, enum: ["dismiss", "remove"], required: true },
  reason: { type: String, enum: ["spam", "harassment", "offensive"], required: true },
  reportedText: { type: String, required: true },
  commentRevision: { type: Number, required: true },
}, { timestamps: true });

export default mongoose.model("comment_moderation_event", schema);
