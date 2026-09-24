import mongoose from "mongoose";

const reactionSchema = new mongoose.Schema({
  commentId: { type: mongoose.Schema.Types.ObjectId, ref: "comment", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  kind: { type: String, enum: ["like", "dislike"], required: true },
}, { timestamps: true });

reactionSchema.index({ commentId: 1, userId: 1 }, { unique: true });

export default mongoose.model("commentreaction", reactionSchema);
