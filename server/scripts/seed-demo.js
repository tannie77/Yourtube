import "dotenv/config";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import mongoose from "mongoose";
import User from "../Modals/Auth.js";
import Video from "../Modals/video.js";
import Comment from "../Modals/comment.js";
import { atlasConfiguration } from "../database/atlas.js";

const run = promisify(execFile);
const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDirectory = path.join(serverDirectory, ".local-data", "demo");
const { uri: databaseUrl, dbName } = atlasConfiguration();
const manifestPath = path.join(fixtureDirectory, `manifest-${dbName}.json`);
const apiUrl = new URL(`http://127.0.0.1:${Number(process.env.PORT) || 5000}`);
const userAgent = "YourTubeDemoFixture/1.0";

const accounts = {
  creator: { name: "YourTube Demo Creator", email: "demo-creator@yourtube.test", deviceId: "yourtube_demo_creator_2026" },
  viewer: { name: "YourTube Demo Viewer", email: "demo-viewer@yourtube.test", deviceId: "yourtube_demo_viewer_2026" },
  admin: { name: "YourTube Demo Admin", email: "demo-admin@yourtube.test", deviceId: "yourtube_demo_admin_2026" },
};
const videos = {
  free: { title: "YourTube Demo: Free captioned video", filename: "free-captioned.mp4", seconds: 16, size: "1280x720", accessPlan: "free" },
  silver: { title: "YourTube Demo: Silver video", filename: "silver.mp4", seconds: 12, size: "1920x1080", accessPlan: "silver" },
};
const comments = {
  hindi: { account: "viewer", body: "नमस्ते, यह हमारा YourTube डेमो वीडियो है।" },
  spanish: { account: "admin", body: "Hola, este vídeo muestra la conversación local." },
};

function checkDemoTarget() {
  if (process.env.ALLOW_ATLAS_DEMO_SEED !== "true" || !dbName.endsWith("_demo")) {
    throw new Error("Demo seeding requires ALLOW_ATLAS_DEMO_SEED=true and an Atlas MONGODB_DB_NAME ending in _demo.");
  }
  if (!Number.isInteger(Number(process.env.PORT || 5000)) || Number(process.env.PORT || 5000) !== 5000) {
    throw new Error("Demo seeding requires the API on port 5000.");
  }
}

async function saveManifest(manifest) {
  const temporaryPath = `${manifestPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, manifestPath);
}

async function loadManifest() {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.version !== 1 || !manifest.accounts || !manifest.videos || !manifest.comments) {
      throw new Error("Unknown demo manifest format. Resolve it manually before seeding.");
    }
    await chmod(manifestPath, 0o600);
    return manifest;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const occupied = await User.find({ email: { $in: Object.values(accounts).map((account) => account.email) } }).select("email").lean();
    if (occupied.length) throw new Error("A demo email already exists without a local manifest; refusing to change that account.");
    const manifest = { version: 1, createdAt: new Date().toISOString(), accounts: {}, videos: {}, comments: {} };
    for (const [role, account] of Object.entries(accounts)) {
      manifest.accounts[role] = { email: account.email, password: randomBytes(24).toString("base64url"), id: null };
    }
    await saveManifest(manifest);
    return manifest;
  }
}

async function request(endpoint, { method = "GET", cookie, deviceId, body } = {}) {
  const headers = { "user-agent": userAgent, "x-yourtube-device-id": deviceId || accounts.viewer.deviceId };
  if (cookie) headers.cookie = cookie;
  if (body && !(body instanceof FormData)) headers["content-type"] = "application/json";
  const response = await fetch(new URL(endpoint, apiUrl), {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(300000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.otpRequired) {
    throw new Error(`${method} ${endpoint} returned ${response.status}: ${result.message || "request failed"}`);
  }
  return { response, result };
}

function sessionCookie(response) {
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie?.startsWith("yourtube2_session=")) throw new Error("The API did not issue a demo session.");
  return cookie;
}

async function signIn(manifest, role) {
  const definition = accounts[role];
  const saved = manifest.accounts[role];
  if (!saved || saved.email !== definition.email || typeof saved.password !== "string" || saved.password.length < 8) {
    throw new Error(`The ${role} demo account is missing or mismatched in the manifest.`);
  }
  const existing = await User.findOne({ email: saved.email }).lean();
  if (!existing && saved.id) throw new Error(`The ${role} demo account is missing; refusing to silently replace it.`);
  if (existing && saved.id && String(existing._id) !== saved.id) throw new Error(`The ${role} demo account ID changed; refusing to alter it.`);
  const { response, result } = existing
    ? await request("/user/login", { method: "POST", deviceId: definition.deviceId, body: { email: saved.email, password: saved.password } })
    : await request("/user/register", { method: "POST", deviceId: definition.deviceId, body: { name: definition.name, email: saved.email, password: saved.password } });
  const id = String(result.user?._id || "");
  if (!mongoose.isValidObjectId(id) || (existing && String(existing._id) !== id)) throw new Error(`The ${role} demo account could not be verified.`);
  saved.id = id;
  await saveManifest(manifest);
  return { id, cookie: sessionCookie(response), deviceId: definition.deviceId };
}

async function ensureChannel(creator) {
  const existing = await User.findById(creator.id).lean();
  if (existing?.channelname === "YourTube Demo Studio") return;
  if (existing?.channelname) throw new Error("Demo creator has a different channel; refusing to replace it.");
  await request(`/user/update/${creator.id}`, {
    method: "PATCH", cookie: creator.cookie, deviceId: creator.deviceId,
    body: { channelname: "YourTube Demo Studio", description: "Short local videos for the YourTube 2.0 migration review." },
  });
}

async function ensureAdmin(admin) {
  const user = await User.findOne({ _id: admin.id, email: accounts.admin.email }).lean();
  if (!user) throw new Error("Demo admin identity could not be verified.");
  if (user.role === "admin") return;
  if (user.role !== "member") throw new Error("Demo admin has an unexpected role.");
  const updated = await User.updateOne({ _id: admin.id, email: accounts.admin.email, role: "member" }, { $set: { role: "admin" } });
  if (updated.modifiedCount !== 1) throw new Error("Could not assign the demo admin role.");
}

async function ensureMedia(definition) {
  const filePath = path.join(fixtureDirectory, definition.filename);
  try {
    if ((await stat(filePath)).size > 0) return filePath;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporaryPath = `${filePath}.tmp.mp4`;
  await run("ffmpeg", [
    "-v", "error", "-f", "lavfi", "-i", `testsrc2=size=${definition.size}:rate=24`,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-t", String(definition.seconds), "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", "-y", temporaryPath,
  ], { timeout: 180000, maxBuffer: 128 * 1024 });
  await rename(temporaryPath, filePath);
  return filePath;
}

async function ensureVideo(manifest, key, creator) {
  const definition = videos[key];
  const saved = manifest.videos[key];
  const existing = await Video.findOne({ uploader: creator.id, videotitle: definition.title }).lean();
  if (saved?.id && existing && String(existing._id) !== saved.id) throw new Error(`The ${key} demo video ID changed.`);
  if (existing) {
    if (existing.accessPlan !== definition.accessPlan || (key === "free" && !existing.captionFilename)) {
      throw new Error(`The ${key} demo video no longer matches its fixture definition.`);
    }
    manifest.videos[key] = { id: String(existing._id), title: definition.title };
    await saveManifest(manifest);
    return String(existing._id);
  }
  if (saved?.id) throw new Error(`The ${key} demo video is missing; refusing to silently replace it.`);
  const filePath = await ensureMedia(definition);
  const form = new FormData();
  form.set("videotitle", definition.title);
  form.set("accessPlan", definition.accessPlan);
  form.set("file", new Blob([await readFile(filePath)], { type: "video/mp4" }), definition.filename);
  if (key === "free") {
    const captions = "WEBVTT\n\n00:00:00.000 --> 00:00:04.000\nWelcome to YourTube 2.0.\n\n00:00:04.000 --> 00:00:09.000\nThis is a local captioned demo video.\n\n00:00:09.000 --> 00:00:16.000\nTry playback, quality, and resume.\n";
    form.set("captions", new Blob([captions], { type: "text/vtt" }), "free-captioned.vtt");
  }
  const { result } = await request("/video/upload", { method: "POST", cookie: creator.cookie, deviceId: creator.deviceId, body: form });
  const id = String(result.video?._id || "");
  if (!mongoose.isValidObjectId(id)) throw new Error(`The ${key} demo upload did not return a video ID.`);
  manifest.videos[key] = { id, title: definition.title };
  await saveManifest(manifest);
  return id;
}

async function ensureComment(manifest, key, videoId, sessions) {
  const definition = comments[key];
  const author = sessions[definition.account];
  const existing = await Comment.findOne({ userid: author.id, videoid: videoId, commentbody: definition.body }).lean();
  if (manifest.comments[key]?.id && existing && String(existing._id) !== manifest.comments[key].id) {
    throw new Error(`The ${key} demo comment ID changed.`);
  }
  if (existing) {
    manifest.comments[key] = { id: String(existing._id) };
    await saveManifest(manifest);
    return;
  }
  if (manifest.comments[key]?.id) throw new Error(`The ${key} demo comment is missing; refusing to silently replace it.`);
  const { result } = await request(`/comment/${videoId}`, {
    method: "POST", cookie: author.cookie, deviceId: author.deviceId, body: { commentbody: definition.body },
  });
  const id = String(result.comment?._id || "");
  if (!mongoose.isValidObjectId(id)) throw new Error(`The ${key} demo comment was not confirmed.`);
  manifest.comments[key] = { id };
  await saveManifest(manifest);
}

async function verify(manifest, sessions) {
  const { result: library } = await request("/video/getall", { cookie: sessions.viewer.cookie, deviceId: sessions.viewer.deviceId });
  const free = library.find((video) => String(video._id) === manifest.videos.free.id);
  const silver = library.find((video) => String(video._id) === manifest.videos.silver.id);
  if (!free?.hasCaptions || !free.canWatch || silver?.accessPlan !== "silver" || silver.canWatch) {
    throw new Error("Viewer video access or captions did not match the demo fixture.");
  }
  const { result: conversation } = await request(`/comment/${free._id}`, { cookie: sessions.viewer.cookie, deviceId: sessions.viewer.deviceId });
  if (!Object.values(manifest.comments).every(({ id }) => conversation.comments.some((comment) => comment._id === id))) {
    throw new Error("The demo comments were not visible through the API.");
  }
  const seededCommentCount = await Comment.countDocuments({ videoid: free._id, $or: [
    { userid: sessions.viewer.id, commentbody: comments.hindi.body },
    { userid: sessions.admin.id, commentbody: comments.spanish.body },
  ] });
  if (seededCommentCount !== 2) throw new Error("The demo comments were duplicated or missing.");
  await request("/comment/moderation/queue", { cookie: sessions.admin.cookie, deviceId: sessions.admin.deviceId });
  const [accountCount, videoCount, adminCount, captionedCount, premiumCount] = await Promise.all([
    User.countDocuments(), Video.countDocuments(), User.countDocuments({ role: "admin" }),
    Video.countDocuments({ captionFilename: { $type: "string" } }), Video.countDocuments({ accessPlan: { $ne: "free" } }),
  ]);
  console.log(`Demo fixtures ready: accounts=${accountCount}, videos=${videoCount}, admins=${adminCount}, captioned=${captionedCount}, premium=${premiumCount}.`);
  console.log(`Credentials and fixture IDs: ${manifestPath}`);
}

async function main() {
  checkDemoTarget();
  await mkdir(fixtureDirectory, { recursive: true, mode: 0o700 });
  await chmod(fixtureDirectory, 0o700);
  await mongoose.connect(databaseUrl, { dbName, serverSelectionTimeoutMS: 10000 });
  const manifest = await loadManifest();
  const sessions = {};
  for (const role of Object.keys(accounts)) sessions[role] = await signIn(manifest, role);
  await ensureChannel(sessions.creator);
  await ensureAdmin(sessions.admin);
  for (const key of Object.keys(videos)) await ensureVideo(manifest, key, sessions.creator);
  for (const key of Object.keys(comments)) await ensureComment(manifest, key, manifest.videos.free.id, sessions);
  await verify(manifest, sessions);
}

try {
  await main();
} catch (error) {
  console.error(`Demo seed stopped: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
