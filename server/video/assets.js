import { execFile } from "node:child_process";
import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { uploadDirectory } from "../filehelp/filehelp.js";

const run = promisify(execFile);
export const qualityOrder = ["480p", "720p", "1080p", "4K"];
const qualityEdge = { "480p": 480, "720p": 720, "1080p": 1080 };

export function assetStem(video) {
  return path.basename(String(video.filepath || ""), ".mp4");
}

export async function removeGeneratedAssets(stem) {
  if (!/^[a-f0-9-]{36}$/i.test(stem)) return;
  const names = await readdir(uploadDirectory);
  await Promise.all(names.filter((name) => name.startsWith(`${stem}-`)).map((name) => unlink(path.join(uploadDirectory, name)).catch(() => {})));
}

export async function generateAssets(sourcePath, metadata) {
  const stem = path.basename(sourcePath, ".mp4");
  const sourceIndex = qualityOrder.indexOf(metadata.sourceQuality);
  const renditions = [{ quality: metadata.sourceQuality, filename: path.basename(sourcePath) }];
  try {
    for (let index = 0; index < sourceIndex; index += 1) {
      const quality = qualityOrder[index];
      const outputName = `${stem}-${quality}.mp4`;
      const edge = qualityEdge[quality];
      const scale = metadata.width >= metadata.height ? `scale=-2:${edge}` : `scale=${edge}:-2`;
      await run("ffmpeg", ["-v", "error", "-i", sourcePath, "-map", "0:v:0", "-map", "0:a:0?", "-vf", scale,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-c:a", "aac", "-movflags", "+faststart", "-y", path.join(uploadDirectory, outputName)],
      { timeout: 300000, maxBuffer: 128 * 1024 });
      renditions.unshift({ quality, filename: outputName });
    }
    const requestedFrames = Math.min(8, Math.max(2, Math.ceil(metadata.durationSeconds * 2)));
    await run("ffmpeg", ["-v", "error", "-i", sourcePath, "-vf", `fps=${requestedFrames / metadata.durationSeconds},scale=192:-2`,
      "-frames:v", String(requestedFrames), "-q:v", "5", "-y", path.join(uploadDirectory, `${stem}-preview-%02d.jpg`)],
    { timeout: 120000, maxBuffer: 128 * 1024 });
    const names = await readdir(uploadDirectory);
    const previewCount = names.filter((name) => name.startsWith(`${stem}-preview-`) && name.endsWith(".jpg")).length;
    return { renditions, previewCount };
  } catch (error) {
    await removeGeneratedAssets(stem);
    throw error;
  }
}
