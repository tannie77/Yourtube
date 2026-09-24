import "dotenv/config";
import mongoose from "mongoose";
import User from "../Modals/Auth.js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error("Usage: node scripts/set-admin.js account@example.com");
  process.exit(1);
}

try {
  await mongoose.connect(process.env.LOCAL_DB_URL || "mongodb://127.0.0.1:27017/vidcircle", { serverSelectionTimeoutMS: 5000 });
  const user = await User.findOneAndUpdate({ email }, { $set: { role: "admin" } }, { returnDocument: "after" });
  if (!user) {
    console.error("No local account has that email. Sign up first, then rerun this command.");
    process.exitCode = 1;
  } else {
    console.log(`Administrator enabled for ${user.email}. Sign out and back in to refresh the sidebar.`);
  }
} catch (error) {
  console.error("Could not update the local account:", error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
