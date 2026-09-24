import mongoose from "mongoose";

const userschema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false },
  name: { type: String, required: true, trim: true },
  channelname: { type: String },
  description: { type: String },
  image: { type: String },
  joinedon: { type: Date, default: Date.now },
});

export default mongoose.model("user", userschema);
