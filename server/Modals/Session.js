import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  tokenHash: { type: String, required: true, unique: true },
  trustedDeviceId: { type: mongoose.Schema.Types.ObjectId, ref: "trusteddevice" },
  ip: { type: String, default: "" },
  userAgent: { type: String, default: "" },
  browser: { type: String, default: "Unknown browser" },
  browserVersion: { type: String, default: "" },
  os: { type: String, default: "Unknown OS" },
  deviceType: { type: String, default: "Unknown device" },
  deviceModel: { type: String, default: "" },
  testCity: { type: String, default: "" },
  testState: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1, expiresAt: -1 });

export default mongoose.model("session", sessionSchema);
