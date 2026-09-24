import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export function sourceQuality(width, height) {
  const shortEdge = Math.min(width, height);
  if (shortEdge <= 480) return "480p";
  if (shortEdge <= 720) return "720p";
  if (shortEdge <= 1080) return "1080p";
  if (shortEdge <= 2160) return "4K";
  return null;
}

export async function probeVideo(filePath) {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration",
    "-of", "json", filePath,
  ], { timeout: 10000, maxBuffer: 64 * 1024 });
  const data = JSON.parse(stdout);
  const width = Number(data.streams?.[0]?.width);
  const height = Number(data.streams?.[0]?.height);
  const durationSeconds = Number(data.format?.duration);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Invalid MP4 video stream");
  }
  return { width, height, durationSeconds, sourceQuality: sourceQuality(width, height) };
}
