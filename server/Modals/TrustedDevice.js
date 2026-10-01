import mongoose from "mongoose";

const trustedDeviceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  deviceHash: { type: String, required: true },
  contextHash: { type: String, required: true },
  browser: { type: String, default: "Unknown browser" },
  browserVersion: { type: String, default: "" },
  os: { type: String, default: "Unknown OS" },
  deviceType: { type: String, default: "Unknown device" },
  deviceModel: { type: String, default: "" },
  ip: { type: String, default: "" },
  testCity: { type: String, default: "" },
  testState: { type: String, default: "" },
  verifiedAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

trustedDeviceSchema.index({ userId: 1, deviceHash: 1 }, { unique: true });
trustedDeviceSchema.index({ userId: 1, expiresAt: -1 });

export default mongoose.model("trusteddevice", trustedDeviceSchema);
