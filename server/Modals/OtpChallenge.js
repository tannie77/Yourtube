import mongoose from "mongoose";

const otpChallengeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  codeHash: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  deviceHash: { type: String, required: true },
  contextHash: { type: String, required: true },
  ip: { type: String, default: "" },
  userAgent: { type: String, default: "" },
  browser: { type: String, default: "Unknown browser" },
  browserVersion: { type: String, default: "" },
  os: { type: String, default: "Unknown OS" },
  deviceType: { type: String, default: "Unknown device" },
  deviceModel: { type: String, default: "" },
  testCity: { type: String, default: "" },
  testState: { type: String, default: "" },
  attempts: { type: Number, default: 0 },
  sentAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date },
  lockedAt: { type: Date },
}, { timestamps: true });

otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("otpchallenge", otpChallengeSchema);
