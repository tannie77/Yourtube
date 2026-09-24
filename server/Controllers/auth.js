import mongoose from "mongoose";
import User from "../Modals/Auth.js";
import { clientContext } from "../security/client-context.js";
import {
  challengeContext,
  findTrustedContext,
  recordLoginAttempt,
  startOtpChallenge,
  touchTrustedContext,
  trustContext,
  verifyOtpToken,
} from "../security/login-security.js";
import { hashPassword, verifyPassword } from "../security/password.js";
import { clearSession, createSession } from "../security/session.js";
import { ensureUsername } from "../security/username.js";

const MAX_AVATAR_BYTES = 256 * 1024;

function validAvatar(value) {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const image = Buffer.from(match[2], "base64");
  if (image.length === 0 || image.length > MAX_AVATAR_BYTES || image.toString("base64") !== match[2]) return false;
  if (match[1] === "png") return image.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  if (match[1] === "jpeg") return image.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"));
  return image.toString("ascii", 0, 4) === "RIFF" && image.toString("ascii", 8, 12) === "WEBP";
}

export function publicUser(user) {
  return {
    _id: user._id,
    email: user.email,
    name: user.name,
    username: user.username,
    location: user.location || "",
    preferredLanguage: user.preferredLanguage || "en",
    themePreference: user.themePreference || "automatic",
    role: user.role || "member",
    channelname: user.channelname,
    description: user.description,
    image: user.image,
    joinedon: user.joinedon,
  };
}

export async function register(request, response) {
  const email = String(request.body?.email || "").trim().toLowerCase();
  const name = String(request.body?.name || "").trim();
  const password = request.body?.password;

  if (!/^\S+@\S+\.\S+$/.test(email) || !name || name.length > 80 ||
      typeof password !== "string" || password.length < 8 || password.length > 128) {
    return response.status(400).json({ message: "Enter a name, valid email and password of 8–128 characters." });
  }

  try {
    const created = await User.create({ email, name, passwordHash: await hashPassword(password) });
    const user = await ensureUsername(created);
    const context = clientContext(request, request.body);
    const trustedDevice = await trustContext(user._id, context);
    await createSession(response, user, { context, trustedDeviceId: trustedDevice._id });
    await recordLoginAttempt({ userId: user._id, email, eventType: "registration", outcome: "signed_in", successful: true, context });
    return response.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ message: "Email is already registered." });
    console.error("Registration failed:", error);
    return response.status(500).json({ message: "Could not create account." });
  }
}

export async function login(request, response) {
  const email = String(request.body?.email || "").trim().toLowerCase();
  const password = request.body?.password;
  if (!email || typeof password !== "string") {
    return response.status(400).json({ message: "Email and password are required." });
  }

  const context = clientContext(request, request.body);
  try {
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      await recordLoginAttempt({ userId: user?._id, email, eventType: "password", outcome: "invalid_credentials", successful: false, context });
      return response.status(401).json({ message: "Invalid email or password." });
    }

    const namedUser = await ensureUsername(user);
    const trustedDevice = await findTrustedContext(namedUser._id, context);
    if (!trustedDevice) {
      try {
        const challenge = await startOtpChallenge(namedUser, context);
        await recordLoginAttempt({ userId: namedUser._id, email, eventType: "password", outcome: "otp_required", successful: true, context });
        return response.status(202).json({
          otpRequired: true,
          challengeToken: challenge.token,
          expiresAt: challenge.expiresAt,
          destination: namedUser.email.replace(/^(.{1,2}).*(@.*)$/, "$1•••$2"),
          message: "Enter the code captured by the local Mailpit inbox.",
        });
      } catch {
        await recordLoginAttempt({ userId: namedUser._id, email, eventType: "password", outcome: "otp_delivery_failed", successful: false, context });
        return response.status(503).json({ message: "Could not deliver the local sign-in code. Start Mailpit and try again." });
      }
    }

    await touchTrustedContext(trustedDevice);
    await createSession(response, namedUser, { context, trustedDeviceId: trustedDevice._id });
    await recordLoginAttempt({ userId: namedUser._id, email, eventType: "password", outcome: "signed_in", successful: true, context });
    return response.json({ user: publicUser(namedUser) });
  } catch (error) {
    console.error("Login failed:", error);
    return response.status(500).json({ message: "Could not sign in." });
  }
}

export async function verifyLoginOtp(request, response) {
  const challengeToken = String(request.body?.challengeToken || "");
  const code = String(request.body?.code || "").trim();

  try {
    const result = await verifyOtpToken(challengeToken, code);
    if (result.status === "invalid" || result.status === "locked") {
      if (result.challenge) {
        const context = challengeContext(result.challenge);
        await recordLoginAttempt({ userId: result.challenge.userId, email: result.challenge.email, eventType: "otp", outcome: "otp_failed", successful: false, context });
      }
      return response.status(result.status === "locked" ? 429 : 400).json({ message: result.status === "locked" ? "Too many incorrect codes. Sign in again to request a new code." : "Enter the valid six-digit code from Mailpit." });
    }
    if (result.status === "expired") {
      const context = challengeContext(result.challenge);
      await recordLoginAttempt({ userId: result.challenge.userId, email: result.challenge.email, eventType: "otp", outcome: "otp_expired", successful: false, context });
      return response.status(410).json({ message: "That code has expired. Sign in again to request a new code." });
    }

    const context = challengeContext(result.challenge);
    const user = await User.findById(result.challenge.userId);
    if (!user) return response.status(410).json({ message: "Account unavailable." });
    const trustedDevice = await trustContext(user._id, context);
    await createSession(response, user, { context, trustedDeviceId: trustedDevice._id });
    await recordLoginAttempt({ userId: user._id, email: user.email, eventType: "otp", outcome: "otp_verified", successful: true, context });
    return response.json({ user: publicUser(await ensureUsername(user)) });
  } catch (error) {
    console.error("OTP verification failed:", error);
    return response.status(500).json({ message: "Could not verify the local sign-in code." });
  }
}

export function me(request, response) {
  return response.json({ user: publicUser(request.user) });
}

export async function logout(request, response) {
  try {
    await clearSession(request, response);
    return response.json({ signedOut: true });
  } catch (error) {
    console.error("Logout failed:", error);
    return response.status(500).json({ message: "Could not sign out." });
  }
}

export async function updateprofile(request, response) {
  const { id } = request.params;
  if (!mongoose.isValidObjectId(id) || request.user.id !== id) {
    return response.status(403).json({ message: "You can only edit your own profile." });
  }

  const channelname = String(request.body?.channelname || "").trim();
  const description = String(request.body?.description || "").trim();
  if (!channelname || channelname.length > 80 || description.length > 1000) {
    return response.status(400).json({ message: "Enter a channel name of up to 80 characters." });
  }

  try {
    const user = await User.findByIdAndUpdate(
      id,
      { $set: { channelname, description } },
      { returnDocument: "after", runValidators: true },
    );
    return response.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Profile update failed:", error);
    return response.status(500).json({ message: "Could not update profile." });
  }
}

export async function updateCommentProfile(request, response) {
  const location = request.body?.location;
  const image = request.body?.image;
  const preferredLanguage = request.body?.preferredLanguage;
  if (location === undefined && image === undefined && preferredLanguage === undefined) {
    return response.status(400).json({ message: "Choose a profile detail to update." });
  }
  if (location !== undefined && (typeof location !== "string" || location.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(location))) {
    return response.status(400).json({ message: "Enter a location of up to 80 characters." });
  }
  if (image !== undefined && !validAvatar(image)) {
    return response.status(400).json({ message: "Choose a PNG, JPEG or WebP picture under 256 KB." });
  }
  if (preferredLanguage !== undefined && !["en", "hi", "es"].includes(preferredLanguage)) {
    return response.status(400).json({ message: "Choose English, Hindi or Spanish." });
  }

  try {
    const changes = {};
    if (location !== undefined) changes.location = location.trim();
    if (image !== undefined) changes.image = image;
    if (preferredLanguage !== undefined) changes.preferredLanguage = preferredLanguage;
    const user = await User.findByIdAndUpdate(request.user._id, { $set: changes }, { returnDocument: "after", runValidators: true });
    return response.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Comment profile update failed:", error);
    return response.status(500).json({ message: "Could not update comment profile." });
  }
}
