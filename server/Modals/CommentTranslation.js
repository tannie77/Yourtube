import mongoose from "mongoose";

const schema = new mongoose.Schema({
  commentId: { type: mongoose.Schema.Types.ObjectId, ref: "comment", required: true },
  revision: { type: Number, required: true },
  language: { type: String, required: true },
  text: { type: String, required: true },
}, { timestamps: true });

schema.index({ commentId: 1, revision: 1, language: 1 }, { unique: true });

export default mongoose.model("comment_translation", schema);
