import { open, unlink } from "node:fs/promises";
import path from "node:path";
import Video from "../Modals/video.js";

function publicVideo(record) {
  const value = typeof record.toObject === "function" ? record.toObject() : record;
  const storedName = path.posix.basename(String(value.filepath || "").replaceAll("\\", "/"));
  const mediaUrl = `/uploads/${encodeURIComponent(storedName)}`;
  return { ...value, filepath: mediaUrl, mediaUrl };
}

async function removeUploadedFile(file) {
  if (file?.path) await unlink(file.path).catch(() => {});
}

async function hasMp4Header(filePath) {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return bytesRead === header.length && header.toString("ascii", 4, 8) === "ftyp";
  } finally {
    await handle.close();
  }
}

export const uploadvideo = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Choose an MP4 video file." });

  const title = typeof req.body?.videotitle === "string" ? req.body.videotitle.trim() : "";
  if (!title || title.length > 120) {
    await removeUploadedFile(req.file);
    return res.status(400).json({ message: "Enter a video title of up to 120 characters." });
  }

  try {
    if (!(await hasMp4Header(req.file.path))) {
      await removeUploadedFile(req.file);
      return res.status(400).json({ message: "That file is not a valid MP4 video." });
    }

    const saved = await Video.create({
      videotitle: title,
      filename: req.file.originalname,
      filepath: `/uploads/${req.file.filename}`,
      filetype: req.file.mimetype,
      filesize: req.file.size,
      videochanel: req.user.channelname,
      uploader: req.user.id,
    });
    return res.status(201).json({ video: publicVideo(saved) });
  } catch (error) {
    await removeUploadedFile(req.file);
    console.error("Video upload failed:", error);
    return res.status(500).json({ message: "Could not save the video. Please try again." });
  }
};
export const getallvideo = async (req, res) => {
  try {
    const files = await Video.find().sort({ createdAt: -1 }).lean();
    return res.status(200).json(files.map(publicVideo));
  } catch (error) {
    console.error("Video list failed:", error);
    return res.status(500).json({ message: "Could not load videos." });
  }
};
