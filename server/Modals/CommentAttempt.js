import mongoose from "mongoose";

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  windowStart: { type: Date, required: true },
  count: { type: Number, default: 0 },
  challengeA: { type: Number, required: true },
  challengeB: { type: Number, required: true },
  challengeSolved: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
});

schema.index({ userId: 1, windowStart: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("comment_attempt", schema);
