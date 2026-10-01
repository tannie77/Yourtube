import { createHash, randomBytes } from "node:crypto";
import Session from "../Modals/Session.js";
import User from "../Modals/Auth.js";
import { ensureUsername } from "./username.js";

export const COOKIE_NAME = "yourtube2_session";
const SESSION_DAYS = 7;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function readSessionCookie(request) {
  const cookies = request.headers.cookie?.split(";") || [];
  const entry = cookies.find((cookie) => cookie.trim().startsWith(`${COOKIE_NAME}=`));
  return entry?.trim().slice(COOKIE_NAME.length + 1) || null;
}

export async function authenticatedUser(request) {
  const token = readSessionCookie(request);
  if (!token) return null;
  const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await User.findById(session.userId);
  if (!user) return null;
  return { user: await ensureUsername(user), session };
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
  };
}

export async function createSession(response, user, { context = {}, trustedDeviceId = null } = {}) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = await Session.create({
    userId: user._id,
    tokenHash: hashToken(token),
    trustedDeviceId,
    ip: context.ip || "",
    userAgent: context.userAgent || "",
    browser: context.browser || "Unknown browser",
    browserVersion: context.browserVersion || "",
    os: context.os || "Unknown OS",
    deviceType: context.deviceType || "Unknown device",
    deviceModel: context.deviceModel || "",
    testCity: context.testCity || "",
    testState: context.testState || "",
    expiresAt,
  });
  response.cookie(COOKIE_NAME, token, {
    ...cookieOptions(),
    expires: expiresAt,
  });
  return session;
}

export async function clearSession(request, response) {
  const token = readSessionCookie(request);
  if (token) await Session.deleteOne({ tokenHash: hashToken(token) });
  response.clearCookie(COOKIE_NAME, cookieOptions());
}

export async function requireAuth(request, response, next) {
  const token = readSessionCookie(request);
  if (!token) return response.status(401).json({ message: "Sign in required." });

  try {
    const session = await Session.findOne({
      tokenHash: hashToken(token),
      expiresAt: { $gt: new Date() },
    });
    if (!session) return response.status(401).json({ message: "Session expired. Sign in again." });

    const user = await User.findById(session.userId);
    if (!user) return response.status(401).json({ message: "Account unavailable." });

    request.user = await ensureUsername(user);
    request.sessionRecord = session;
    if (!session.lastSeenAt || Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
      session.lastSeenAt = new Date();
      await session.save();
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function clearSessionCookie(response) {
  response.clearCookie(COOKIE_NAME, cookieOptions());
}

export function requireAdmin(request, response, next) {
  if (request.user?.role !== "admin") return response.status(403).json({ message: "Administrator access required." });
  next();
}
