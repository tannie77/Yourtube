import "dotenv/config";
import { execFile } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mongoose from "mongoose";
import User from "../Modals/Auth.js";
import Video from "../Modals/video.js";
import { uploadDirectory } from "../filehelp/filehelp.js";
import { hashPassword } from "../security/password.js";
import { ensureUsername } from "../security/username.js";
import { atlasConfiguration } from "../database/atlas.js";

const run = promisify(execFile);
const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(serverDirectory, "fixtures", "christmas-gift.mp4");
const manifestPath = path.join(serverDirectory, ".local-data", "requested-video.json");
const expectedHash = "FC2FE37CE8D1D0665ED0FE76222143176EE7841B253F9AA7DD10D7E0D9C11F69";
const title = "Christmas gift";
const channel = "Nature Lover";
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";

async function main() {
  const input = await readFile(fixture);
  const digest = createHash("sha256").update(input).digest("hex").toUpperCase();
  if (digest !== expectedHash || input.toString("ascii", 4, 8) !== "ftyp") {
    throw new Error("The supplied video fixture has changed. Check it before seeding.");
  }
  const { uri, dbName } = atlasConfiguration();
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  try {
    let manifest;
    try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (manifest) {
      const video = await Video.findById(manifest.videoId).lean();
      if (!video || video.videotitle !== title || video.videochanel !== channel ||
          !video.filepath.startsWith("/uploads/") || !(await stat(path.join(uploadDirectory, path.basename(video.filepath))).catch(() => null))) {
        throw new Error("The existing video fixture is incomplete. Inspect it before reseeding.");
      }
      console.log(`Video already ready: ${video._id}`);
      return;
    }
    if (await Video.exists({ videotitle: title, videochanel: channel })) {
      throw new Error("A matching video exists without a local fixture manifest. Refusing to duplicate it.");
    }

    await mkdir(uploadDirectory, { recursive: true });
    await mkdir(path.dirname(manifestPath), { recursive: true });
    const stem = randomUUID();
    const original = path.join(uploadDirectory, `${stem}.mp4`);
    const freeVersion = path.join(uploadDirectory, `${stem}-480p.mp4`);
    const preview = path.join(uploadDirectory, `${stem}-preview-01.jpg`);
    let user;
    let video;
    try {
      await writeFile(original, input);
      await run(ffmpeg, ["-v", "error", "-i", original, "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale=-2:480",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-c:a", "aac", "-movflags", "+faststart", "-y", freeVersion],
      { timeout: 120000, maxBuffer: 128 * 1024 });
      await run(ffmpeg, ["-v", "error", "-ss", "1", "-i", original, "-vf", "scale=320:-2", "-frames:v", "1", "-y", preview],
        { timeout: 30000, maxBuffer: 128 * 1024 });
      const password = randomBytes(24).toString("base64url");
      const email = `nature-lover-${randomUUID().slice(0, 8)}@yourtube.test`;
      user = await User.create({ email, name: channel, channelname: channel, passwordHash: await hashPassword(password) });
      await ensureUsername(user);
      video = await Video.create({
        videotitle: title, filename: "christmas-gift.mp4", filetype: "video/mp4", filepath: `/uploads/${stem}.mp4`,
        filesize: input.length, videochanel: channel, uploader: String(user._id), accessPlan: "free",
        width: 1280, height: 720, durationSeconds: 7.447, sourceQuality: "720p",
        renditions: [{ quality: "480p", filename: `${stem}-480p.mp4` }, { quality: "720p", filename: `${stem}.mp4` }],
        previewCount: 1,
      });
      await writeFile(manifestPath, `${JSON.stringify({ videoId: String(video._id), userId: String(user._id), email, password, sourceHash: digest }, null, 2)}\n`, { mode: 0o600 });
      await chmod(manifestPath, 0o600);
      console.log(`Video ready: ${video._id}`);
      console.log(`Creator credentials saved in ${manifestPath}`);
    } catch (error) {
      if (video) await Video.deleteOne({ _id: video._id }).catch(() => {});
      if (user) await User.deleteOne({ _id: user._id }).catch(() => {});
      await Promise.all([original, freeVersion, preview].map((file) => unlink(file).catch(() => {})));
      throw error;
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
