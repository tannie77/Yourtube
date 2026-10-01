import mongoose from "mongoose";

const clientFields = {
  ip: { type: String, default: "" },
  userAgent: { type: String, default: "" },
  browser: { type: String, default: "Unknown browser" },
  browserVersion: { type: String, default: "" },
  os: { type: String, default: "Unknown OS" },
  deviceType: { type: String, default: "Unknown device" },
  deviceModel: { type: String, default: "" },
  testCity: { type: String, default: "" },
  testState: { type: String, default: "" },
};

const loginAttemptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  eventType: { type: String, enum: ["registration", "password", "otp"], required: true },
  outcome: {
    type: String,
    enum: ["signed_in", "invalid_credentials", "otp_required", "otp_delivery_failed", "otp_failed", "otp_verified", "otp_expired"],
    required: true,
  },
  successful: { type: Boolean, required: true },
  ...clientFields,
  occurredAt: { type: Date, default: Date.now, index: true },
});

loginAttemptSchema.index({ userId: 1, occurredAt: -1 });

export default mongoose.model("loginattempt", loginAttemptSchema);
