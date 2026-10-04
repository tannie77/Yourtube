import mongoose from "mongoose";
import { commentLanguages } from "../comments/languages.js";

const userschema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false },
  name: { type: String, required: true, trim: true },
  username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  location: { type: String, default: "" },
  preferredLanguage: { type: String, enum: Object.keys(commentLanguages), default: "en" },
  themePreference: { type: String, enum: ["automatic", "light", "dark"], default: "automatic" },
  restrictDownloadsToTrustedDevices: { type: Boolean, default: false },
  role: { type: String, enum: ["member", "admin"], default: "member" },
  channelname: { type: String },
  description: { type: String },
  image: { type: String },
  joinedon: { type: Date, default: Date.now },
});

export default mongoose.model("user", userschema);
