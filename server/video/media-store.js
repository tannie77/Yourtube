import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import mongoose from "mongoose";
import { uploadDirectory } from "../filehelp/filehelp.js";

export const usesAtlasMedia = () => process.env.MEDIA_STORAGE === "gridfs";

function mediaBucket() {
  if (!mongoose.connection.db) throw new Error("Atlas media storage is unavailable.");
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "video_assets" });
}

function safeName(filename) {
  if (typeof filename !== "string" || !/^[a-f0-9-]{36}(?:-(?:480p|720p|1080p|4K|preview-\d{2}))?\.(?:mp4|vtt|jpg)$/i.test(filename)) {
    throw new Error("Invalid media filename.");
  }
  return filename;
}

export async function atlasAssetInfo(filename) {
  return mediaBucket().find({ filename: safeName(filename) }).limit(1).next();
}

export async function mediaInfo(filename) {
  safeName(filename);
  if (usesAtlasMedia()) {
    const file = await atlasAssetInfo(filename);
    return file ? { length: file.length, id: file._id } : null;
  }
  try {
    const file = await stat(path.join(uploadDirectory, filename));
    return file.isFile() ? { length: file.size } : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function storeAtlasAsset(filePath) {
  const filename = safeName(path.basename(filePath));
  const existing = await atlasAssetInfo(filename);
  if (existing) return { id: existing._id, created: false };
  const stream = mediaBucket().openUploadStream(filename);
  await pipeline(createReadStream(filePath), stream);
  return { id: stream.id, created: true };
}

export async function removeAtlasAssets(filenames) {
  const bucket = mediaBucket();
  for (const filename of filenames) {
    const file = await atlasAssetInfo(filename);
    if (file) await bucket.delete(file._id);
  }
}

function byteRange(header, length) {
  if (!header) return { start: 0, end: length - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return null;
    start = Math.max(0, length - suffix);
    end = length - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : length - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
    end = Math.min(end, length - 1);
  }
  if (start >= length || end < start) return null;
  return { start, end, partial: true };
}

export async function streamAtlasAsset(request, response, filename, { allowRange = false } = {}) {
  const file = await atlasAssetInfo(filename);
  if (!file) return false;
  const range = allowRange ? byteRange(request.headers.range, file.length) : { start: 0, end: file.length - 1, partial: false };
  if (!range) {
    response.set("Content-Range", `bytes */${file.length}`);
    response.status(416).end();
    return true;
  }
  response.set("Content-Length", String(range.end - range.start + 1));
  if (allowRange) response.set("Accept-Ranges", "bytes");
  if (range.partial) {
    response.set("Content-Range", `bytes ${range.start}-${range.end}/${file.length}`);
    response.status(206);
  }
  await pipeline(mediaBucket().openDownloadStream(file._id, { start: range.start, end: range.end + 1 }), response);
  return true;
}
