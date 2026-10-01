import mongoose from "mongoose";

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  dayKey: { type: String, required: true },
  secondsReserved: { type: Number, default: 0 },
  videoIds: { type: [String], default: [] },
}, { timestamps: true });

schema.index({ userId: 1, dayKey: 1 }, { unique: true });

export default mongoose.model("dailywatchusage", schema);
