import mongoose from "mongoose";

const callRoomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true, immutable: true },
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, immutable: true },
  title: { type: String, required: true, maxlength: 80 },
  e2eeKeyDigest: { type: String, default: null, select: false },
  locked: { type: Boolean, default: false },
  allowChat: { type: Boolean, default: true },
  allowShare: { type: Boolean, default: true },
  coHostIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
  removedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
  endedAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model("CallRoom", callRoomSchema);
