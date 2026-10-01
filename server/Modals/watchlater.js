import mongoose from "mongoose";
const watchlaterschema = mongoose.Schema(
  {
    viewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    videoid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      required: true,
    },
    savedon: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

watchlaterschema.index({ viewer: 1, videoid: 1 }, { unique: true });

export default mongoose.model("watchlater", watchlaterschema);
