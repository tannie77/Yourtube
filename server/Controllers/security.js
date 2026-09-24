import mongoose from "mongoose";
import LoginAttempt from "../Modals/LoginAttempt.js";
import Session from "../Modals/Session.js";
import TrustedDevice from "../Modals/TrustedDevice.js";
import User from "../Modals/Auth.js";
import { publicClientContext } from "../security/client-context.js";
import { clearSessionCookie } from "../security/session.js";

function publicSession(session, currentSessionId) {
  return {
    id: session.id,
    current: session.id === currentSessionId,
    ...publicClientContext(session),
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt || session.createdAt,
    expiresAt: session.expiresAt,
  };
}

function publicTrustedDevice(device, currentTrustedDeviceId) {
  return {
    id: device.id,
    current: device.id === currentTrustedDeviceId,
    ...publicClientContext(device),
    verifiedAt: device.verifiedAt,
    lastUsedAt: device.lastUsedAt,
    expiresAt: device.expiresAt,
  };
}

function publicAttempt(attempt) {
  return {
    id: attempt.id,
    eventType: attempt.eventType,
    outcome: attempt.outcome,
    successful: attempt.successful,
    ...publicClientContext(attempt),
    occurredAt: attempt.occurredAt,
  };
}

export async function securityOverview(request, response) {
  try {
    const now = new Date();
    const [sessions, trustedDevices, attempts] = await Promise.all([
      Session.find({ userId: request.user._id, expiresAt: { $gt: now } }).sort({ lastSeenAt: -1 }),
      TrustedDevice.find({ userId: request.user._id, expiresAt: { $gt: now } }).sort({ lastUsedAt: -1 }),
      LoginAttempt.find({ userId: request.user._id }).sort({ occurredAt: -1 }).limit(40),
    ]);
    const currentTrustedDeviceId = request.sessionRecord.trustedDeviceId?.toString() || "";
    return response.json({
      sessions: sessions.map((session) => publicSession(session, request.sessionRecord.id)),
      trustedDevices: trustedDevices.map((device) => publicTrustedDevice(device, currentTrustedDeviceId)),
      attempts: attempts.map(publicAttempt),
      themePreference: request.user.themePreference || "automatic",
      note: "IP and location values describe this local prototype only. Test city/state are supplied by the user.",
    });
  } catch (error) {
    console.error("Security overview failed:", error);
    return response.status(500).json({ message: "Could not load account security." });
  }
}

export async function revokeSession(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ message: "Session not found." });
  try {
    const session = await Session.findOneAndDelete({ _id: request.params.id, userId: request.user._id });
    if (!session) return response.status(404).json({ message: "Session not found." });
    const current = session.id === request.sessionRecord.id;
    if (current) clearSessionCookie(response);
    return response.json({ revoked: true, current });
  } catch (error) {
    console.error("Session revocation failed:", error);
    return response.status(500).json({ message: "Could not revoke that session." });
  }
}

export async function revokeOtherSessions(request, response) {
  try {
    const result = await Session.deleteMany({ userId: request.user._id, _id: { $ne: request.sessionRecord._id } });
    return response.json({ revoked: result.deletedCount });
  } catch (error) {
    console.error("Other-session revocation failed:", error);
    return response.status(500).json({ message: "Could not revoke the other sessions." });
  }
}

export async function revokeTrustedDevice(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ message: "Trusted device not found." });
  try {
    const device = await TrustedDevice.findOneAndDelete({ _id: request.params.id, userId: request.user._id });
    if (!device) return response.status(404).json({ message: "Trusted device not found." });
    return response.json({ revoked: true });
  } catch (error) {
    console.error("Trusted-device revocation failed:", error);
    return response.status(500).json({ message: "Could not remove that trusted device." });
  }
}

export async function updateTheme(request, response) {
  const themePreference = request.body?.themePreference;
  if (!["automatic", "light", "dark"].includes(themePreference)) {
    return response.status(400).json({ message: "Choose automatic, light or dark theme." });
  }
  try {
    const user = await User.findByIdAndUpdate(request.user._id, { $set: { themePreference } }, { returnDocument: "after", runValidators: true });
    return response.json({ themePreference: user.themePreference });
  } catch (error) {
    console.error("Theme preference update failed:", error);
    return response.status(500).json({ message: "Could not save the theme preference." });
  }
}
