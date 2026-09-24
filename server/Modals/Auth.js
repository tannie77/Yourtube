import mongoose from "mongoose";

const userschema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false },
  name: { type: String, required: true, trim: true },
  username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  location: { type: String, default: "" },
  preferredLanguage: { type: String, enum: ["en", "hi", "es"], default: "en" },
  role: { type: String, enum: ["member", "admin"], default: "member" },
  channelname: { type: String },
  description: { type: String },
  image: { type: String },
  joinedon: { type: Date, default: Date.now },
});

export default mongoose.model("user", userschema);
