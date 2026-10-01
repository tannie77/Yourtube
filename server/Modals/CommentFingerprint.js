import mongoose from "mongoose";

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: "videofiles", required: true },
  digest: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});

schema.index({ userId: 1, videoId: 1, digest: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("comment_fingerprint", schema);
