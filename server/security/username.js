import User from "../Modals/Auth.js";

export function usernameFor(user, suffixLength = 8) {
  const base = String(user.name || "member")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24) || "member";
  return `${base}-${String(user._id).slice(-suffixLength)}`;
}

export async function ensureUsername(user) {
  if (user.username) return user;
  for (const suffixLength of [8, 24]) {
    try {
      const updated = await User.findOneAndUpdate(
        { _id: user._id, username: null },
        { $set: { username: usernameFor(user, suffixLength) } },
        { returnDocument: "after", runValidators: true },
      );
      if (updated) return updated;
      return await User.findById(user._id);
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  throw new Error("Could not assign a unique username.");
}

export async function backfillUsernames() {
  const users = await User.find({ username: null }).select("_id name username");
  for (const user of users) await ensureUsername(user);
}
