import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

export const uploadDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads");
export const maxVideoBytes = 100 * 1024 * 1024;
mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    callback(null, uploadDirectory);
  },
  filename: (_request, _file, callback) => {
    callback(null, `${randomUUID()}.mp4`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: maxVideoBytes, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype !== "video/mp4") {
      return callback(new Error("Choose an MP4 video file."));
    }
    callback(null, true);
  },
});
export default upload;
