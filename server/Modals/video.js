import mongoose from "mongoose";
const videoschema = mongoose.Schema(
  {
    videotitle: { type: String, required: true },
    filename: { type: String, required: true },
    filetype: { type: String, required: true },
    filepath: { type: String, required: true },
    filesize: { type: Number, required: true },
    videochanel: { type: String, required: true },
    Like: { type: Number, default: 0 },
    Dislike: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    uploader: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("videofiles", videoschema);
