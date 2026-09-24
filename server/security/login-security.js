import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import LoginAttempt from "../Modals/LoginAttempt.js";
import OtpChallenge from "../Modals/OtpChallenge.js";
import TrustedDevice from "../Modals/TrustedDevice.js";
import { sendLocalMail } from "../notifications/mailpit.js";

const OTP_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

function trustedDeviceDays() {
  const configured = Number(process.env.TRUSTED_DEVICE_DAYS || 30);
  return Number.isInteger(configured) && configured >= 1 && configured <= 365 ? configured : 30;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function otpDigest(token, code) {
  return digest(`${token}:${code}`);
}

function safeEqualHex(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function contextFields(context) {
  return {
    ip: context.ip,
    userAgent: context.userAgent,
    browser: context.browser,
    browserVersion: context.browserVersion,
    os: context.os,
    deviceType: context.deviceType,
    deviceModel: context.deviceModel,
    testCity: context.testCity,
    testState: context.testState,
  };
}

export async function recordLoginAttempt({ userId, email, eventType, outcome, successful, context }) {
  return LoginAttempt.create({ userId, email, eventType, outcome, successful, ...contextFields(context) });
}

export async function findTrustedContext(userId, context) {
  return TrustedDevice.findOne({
    userId,
    deviceHash: context.deviceHash,
    contextHash: context.contextHash,
    expiresAt: { $gt: new Date() },
  });
}

export async function trustContext(userId, context) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + trustedDeviceDays() * 24 * 60 * 60 * 1000);
  return TrustedDevice.findOneAndUpdate(
    { userId, deviceHash: context.deviceHash },
    {
      $set: {
        contextHash: context.contextHash,
        ...contextFields(context),
        verifiedAt: now,
        lastUsedAt: now,
        expiresAt,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
}

export async function touchTrustedContext(device) {
  device.lastUsedAt = new Date();
  await device.save();
  return device;
}

export async function startOtpChallenge(user, context) {
  const token = randomBytes(32).toString("base64url");
  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + OTP_MINUTES * 60 * 1000);
  await OtpChallenge.updateMany(
    { userId: user._id, deviceHash: context.deviceHash, consumedAt: { $exists: false }, lockedAt: { $exists: false } },
    { $set: { lockedAt: new Date() } },
  );
  const challenge = await OtpChallenge.create({
    userId: user._id,
    tokenHash: digest(token),
    codeHash: otpDigest(token, code),
    email: user.email,
    deviceHash: context.deviceHash,
    contextHash: context.contextHash,
    ...contextFields(context),
    expiresAt,
  });

  try {
    const location = [context.testCity, context.testState].filter(Boolean).join(", ") || "No local test location supplied";
    await sendLocalMail({
      recipient: user.email,
      fromAddress: "security@vidcircle.local",
      subject: "Your VidCircle local sign-in code",
      body: [
        "VidCircle local sign-in verification",
        "",
        `Hello ${user.name},`,
        `Your one-time code is: ${code}`,
        "",
        `Browser: ${context.browser}${context.browserVersion ? ` ${context.browserVersion}` : ""}`,
        `Device: ${context.deviceModel || context.deviceType}`,
        `Local test location: ${location}`,
        `The code expires in ${OTP_MINUTES} minutes.`,
        "",
        "This message was captured by the local Mailpit inbox and was not sent externally.",
      ].join("\r\n"),
    });
    return { challenge, token, expiresAt };
  } catch (error) {
    await OtpChallenge.deleteOne({ _id: challenge._id });
    throw error;
  }
}

export async function verifyOtpToken(token, code) {
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token) || !/^\d{6}$/.test(code)) return { status: "invalid" };
  const challenge = await OtpChallenge.findOne({ tokenHash: digest(token) });
  if (!challenge || challenge.consumedAt || challenge.lockedAt) return { status: "invalid" };
  if (challenge.expiresAt <= new Date()) return { status: "expired", challenge };
  if (challenge.attempts >= MAX_OTP_ATTEMPTS) return { status: "locked", challenge };

  if (!safeEqualHex(challenge.codeHash, otpDigest(token, code))) {
    challenge.attempts += 1;
    if (challenge.attempts >= MAX_OTP_ATTEMPTS) challenge.lockedAt = new Date();
    await challenge.save();
    return { status: challenge.lockedAt ? "locked" : "invalid", challenge };
  }

  challenge.consumedAt = new Date();
  await challenge.save();
  return { status: "verified", challenge };
}

export function challengeContext(challenge) {
  return {
    deviceHash: challenge.deviceHash,
    contextHash: challenge.contextHash,
    ...contextFields(challenge),
  };
}
