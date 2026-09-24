import mongoose from "mongoose";

const revisionSchema = new mongoose.Schema({
  revision: { type: Number, required: true },
  action: { type: String, enum: ["created", "edited", "deleted", "moderated", "snapshot"], required: true },
  commentbody: { type: String, default: "" },
  changedAt: { type: Date, required: true },
}, { _id: false });

const commentschema = mongoose.Schema(
  {
    userid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    videoid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      required: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "comment",
      default: null,
    },
    commentbody: { type: String },
    usercommented: { type: String },
    commentedon: { type: Date, default: Date.now },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    revision: { type: Number, default: 1 },
    revisionHistory: { type: [revisionSchema], default: [] },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

commentschema.index({ videoid: 1, createdAt: 1 });
commentschema.index({ parentId: 1 });

export default mongoose.model("comment", commentschema);
