import mongoose from "mongoose";
import User from "../Modals/Auth.js";
import { hashPassword, verifyPassword } from "../security/password.js";
import { clearSession, createSession } from "../security/session.js";

function publicUser(user) {
  return {
    _id: user._id,
    email: user.email,
    name: user.name,
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
    const user = await User.create({ email, name, passwordHash: await hashPassword(password) });
    await createSession(response, user);
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

  try {
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return response.status(401).json({ message: "Invalid email or password." });
    }

    await createSession(response, user);
    return response.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Login failed:", error);
    return response.status(500).json({ message: "Could not sign in." });
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
