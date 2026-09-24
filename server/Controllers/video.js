import { open, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import Video from "../Modals/video.js";
import History from "../Modals/history.js";
import WatchProgress from "../Modals/WatchProgress.js";
import { maxCaptionBytes, uploadDirectory } from "../filehelp/filehelp.js";
import { planIds } from "../subscriptions/plans.js";
import { readSubscription } from "../subscriptions/state.js";
import { availableQualities, canWatchVideo, isEarlyAccess, requiredVideoPlan, showLocalAd } from "../subscriptions/video-access.js";
import { assetStem, generateAssets, removeGeneratedAssets } from "../video/assets.js";
import { probeVideo } from "../video/metadata.js";
import { reserveWatch, usageSnapshot } from "../video/usage.js";

function publicVideo(record, user, subscription) {
  const value = typeof record.toObject === "function" ? record.toObject() : record;
  const { renditions: _renditions, captionFilename: _captionFilename, ...safeValue } = value;
  const mediaUrl = `/video/${value._id}/media`;
  return {
    ...safeValue,
    filepath: mediaUrl,
    mediaUrl,
    accessPlan: requiredVideoPlan(value),
    canWatch: canWatchVideo(value, user, subscription),
    qualityOptions: availableQualities(value, user, subscription).map(({ filename: _filename, ...option }) => option),
    hasCaptions: Boolean(value.captionFilename),
    earlyAccessActive: isEarlyAccess(value),
    showLocalAd: showLocalAd(subscription),
  };
}

export function storedPath(video) {
  const storedName = path.posix.basename(String(video.filepath || "").replaceAll("\\", "/"));
  return storedName.toLowerCase().endsWith(".mp4") ? path.join(uploadDirectory, storedName) : null;
}

export async function withMetadata(video) {
  if (video.sourceQuality && video.durationSeconds) return video;
  const filePath = storedPath(video);
  if (!filePath) return { ...video, mediaUnavailable: true };
  try {
    const metadata = await probeVideo(filePath);
    if (!metadata.sourceQuality) return { ...video, mediaUnavailable: true };
    await Video.updateOne({ _id: video._id }, { $set: metadata });
    return { ...video, ...metadata };
  } catch {
    return { ...video, mediaUnavailable: true };
  }
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
  const videoFile = req.files?.file?.[0];
  const captionFile = req.files?.captions?.[0];
  const removeInputs = async () => { await Promise.all([removeUploadedFile(videoFile), removeUploadedFile(captionFile)]); };
  if (!videoFile) { await removeUploadedFile(captionFile); return res.status(400).json({ message: "Choose an MP4 video file." }); }

  const title = typeof req.body?.videotitle === "string" ? req.body.videotitle.trim() : "";
  if (!title || title.length > 120) {
    await removeInputs();
    return res.status(400).json({ message: "Enter a video title of up to 120 characters." });
  }

  const accessPlan = req.body?.accessPlan || "free";
  if (typeof accessPlan !== "string" || !planIds.includes(accessPlan)) {
    await removeInputs();
    return res.status(400).json({ message: "Choose a valid minimum viewer plan." });
  }

  const earlyAccess = req.body?.earlyAccess === "true";
  if (req.body?.earlyAccess && !["true", "false"].includes(req.body.earlyAccess)) {
    await removeInputs();
    return res.status(400).json({ message: "Choose a valid early-access option." });
  }

  let saved;
  try {
    if (captionFile) {
      if (captionFile.size > maxCaptionBytes) {
        await removeInputs();
        return res.status(400).json({ message: "WebVTT captions must be 1 MB or smaller." });
      }
      let captionText;
      try { captionText = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(captionFile.path)); }
      catch { captionText = ""; }
      if (!/^\uFEFF?WEBVTT(?:[ \t].*)?\r?\n/.test(captionText) || !/\d{2}:\d{2}(?::\d{2})?\.\d{3}\s+-->\s+\d{2}:\d{2}(?::\d{2})?\.\d{3}/.test(captionText)) {
        await removeInputs();
        return res.status(400).json({ message: "Choose a valid UTF-8 WebVTT file with at least one cue." });
      }
    }
    if (!(await hasMp4Header(videoFile.path))) {
      await removeInputs();
      return res.status(400).json({ message: "That file is not a valid MP4 video." });
    }

    let metadata;
    try {
      metadata = await probeVideo(videoFile.path);
    } catch {
      await removeInputs();
      return res.status(400).json({ message: "That MP4 has no readable video stream. Check the file and local ffprobe installation." });
    }
    if (!metadata.sourceQuality) {
      await removeInputs();
      return res.status(400).json({ message: "Videos above 4K are not supported in this local prototype." });
    }

    const assets = await generateAssets(videoFile.path, metadata);
    saved = await Video.create({
      videotitle: title,
      filename: videoFile.originalname,
      filepath: `/uploads/${videoFile.filename}`,
      filetype: videoFile.mimetype,
      filesize: videoFile.size,
      videochanel: req.user.channelname,
      uploader: req.user.id,
      accessPlan,
      ...metadata,
      ...assets,
      captionFilename: captionFile?.filename || null,
      earlyAccessUntil: earlyAccess ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
    });
    const subscription = await readSubscription(req.user._id);
    return res.status(201).json({ video: publicVideo(saved, req.user, subscription) });
  } catch (error) {
    if (saved) await Video.deleteOne({ _id: saved._id }).catch(() => {});
    await removeGeneratedAssets(path.basename(videoFile.path, ".mp4"));
    await removeInputs();
    console.error("Video upload failed:", error);
    return res.status(500).json({ message: "Could not save the video. Please try again." });
  }
};
export const getallvideo = async (req, res) => {
  try {
    const [files, subscription] = await Promise.all([
      Video.find().sort({ createdAt: -1 }).lean(),
      readSubscription(req.user._id),
    ]);
    const ready = await Promise.all(files.map(withMetadata));
    res.set("Cache-Control", "private, no-store");
    return res.status(200).json(ready.map((file) => ({ ...publicVideo(file, req.user, subscription), canWatch: !file.mediaUnavailable && canWatchVideo(file, req.user, subscription) })));
  } catch (error) {
    console.error("Video list failed:", error);
    return res.status(500).json({ message: "Could not load videos." });
  }
};

export const streamvideo = async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Video not found." });
  }

  try {
    const stored = await Video.findById(req.params.id).lean();
    if (!stored) return res.status(404).json({ message: "Video not found." });
    const video = await withMetadata(stored);
    if (video.mediaUnavailable) return res.status(404).json({ message: "Video file unavailable." });

    const subscription = await readSubscription(req.user._id);
    if (!canWatchVideo(video, req.user, subscription)) {
      res.set("Cache-Control", "private, no-store");
      return res.status(403).json({
        code: "PLAN_REQUIRED",
        requiredPlanId: requiredVideoPlan(video),
        message: "This video needs a higher membership plan.",
      });
    }

    const qualities = availableQualities(video, req.user, subscription);
    const requestedQuality = req.query.quality;
    if (requestedQuality !== undefined && (typeof requestedQuality !== "string" || !qualities.some((entry) => entry.quality === requestedQuality))) {
      return res.status(400).json({ message: "Choose an available video quality." });
    }
    const selected = requestedQuality ? qualities.find((entry) => entry.quality === requestedQuality) : qualities.filter((entry) => entry.allowed).at(-1);
    if (!selected?.allowed) {
      res.set("Cache-Control", "private, no-store");
      return res.status(403).json({ code: "QUALITY_PLAN_REQUIRED", requiredPlanId: selected?.requiredPlanId, message: "This quality needs a higher membership plan." });
    }
    if (selected.filename && !/^[a-f0-9-]{36}(?:-(?:480p|720p|1080p|4K))?\.mp4$/i.test(selected.filename)) {
      return res.status(404).json({ message: "Video file unavailable." });
    }
    const filePath = selected.filename ? path.join(uploadDirectory, selected.filename) : storedPath(video);
    if (!filePath) return res.status(404).json({ message: "Video file unavailable." });
    try { await stat(filePath); } catch { return res.status(404).json({ message: "Video file unavailable." }); }
    const reservation = await reserveWatch(req.user._id, video, subscription);
    if (!reservation.allowed) {
      res.set("Cache-Control", "private, no-store");
      return res.status(429).json({ code: "WATCH_LIMIT_REACHED", message: "Today's viewing allowance is used up. Try again after midnight IST or choose a higher plan." });
    }
    await History.updateOne(
      { viewer: req.user._id, videoid: video._id },
      { $set: { viewedon: new Date() } },
      { upsert: true },
    );
    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    return res.sendFile(path.basename(filePath), { root: uploadDirectory, dotfiles: "deny", acceptRanges: true }, (error) => {
      if (!error) return;
      if (res.headersSent) return next(error);
      return res.status(404).json({ message: "Video file unavailable." });
    });
  } catch (error) {
    return next(error);
  }
};

export const getCaption = async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    const video = await accessibleVideo(req, res);
    if (!video) return;
    if (!video.captionFilename || !/^[a-f0-9-]{36}\.vtt$/i.test(video.captionFilename)) return res.status(404).json({ message: "Captions unavailable." });
    return res.type("text/vtt; charset=utf-8").sendFile(video.captionFilename, { root: uploadDirectory, dotfiles: "deny" }, next);
  } catch (error) { return next(error); }
};

export const getPreview = async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    const video = await accessibleVideo(req, res);
    if (!video) return;
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0 || index >= (video.previewCount || 0)) return res.status(404).json({ message: "Preview unavailable." });
    const filename = `${assetStem(video)}-preview-${String(index + 1).padStart(2, "0")}.jpg`;
    return res.type("image/jpeg").sendFile(filename, { root: uploadDirectory, dotfiles: "deny" }, next);
  } catch (error) { return next(error); }
};

export const getWatchUsage = async (req, res, next) => {
  try {
    const subscription = await readSubscription(req.user._id);
    res.set("Cache-Control", "private, no-store");
    return res.json(await usageSnapshot(req.user._id, subscription));
  } catch (error) { return next(error); }
};

function completionPercent() {
  const configured = Number(process.env.WATCH_COMPLETE_PERCENT);
  return Number.isFinite(configured) && configured >= 1 && configured <= 100 ? configured : 90;
}

async function accessibleVideo(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ message: "Video not found." });
    return null;
  }
  const stored = await Video.findById(req.params.id).lean();
  if (!stored) {
    res.status(404).json({ message: "Video not found." });
    return null;
  }
  const video = await withMetadata(stored);
  if (video.mediaUnavailable) {
    res.status(404).json({ message: "Video file unavailable." });
    return null;
  }
  const subscription = await readSubscription(req.user._id);
  if (!canWatchVideo(video, req.user, subscription)) {
    res.status(403).json({ code: "PLAN_REQUIRED", message: "This video needs a higher membership plan." });
    return null;
  }
  return video;
}

function progressPayload(record, video) {
  const durationSeconds = video.durationSeconds;
  const watchedSeconds = Math.min(record?.watchedSeconds || 0, durationSeconds);
  return {
    positionSeconds: Math.min(record?.positionSeconds || 0, durationSeconds),
    watchedSeconds,
    completed: watchedSeconds / durationSeconds >= completionPercent() / 100,
    completionPercent: completionPercent(),
    durationSeconds,
    updatedAt: record?.updatedAt || null,
  };
}

export const getWatchProgress = async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    const video = await accessibleVideo(req, res);
    if (!video) return;
    const record = await WatchProgress.findOne({ viewer: req.user._id, videoid: video._id }).lean();
    return res.json(progressPayload(record, video));
  } catch (error) { return next(error); }
};

export const saveWatchProgress = async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    const video = await accessibleVideo(req, res);
    if (!video) return;
    const position = req.body?.positionSeconds;
    const watchedDelta = req.body?.watchedSecondsDelta;
    if (typeof position !== "number" || !Number.isFinite(position) || position < 0) {
      return res.status(400).json({ message: "Position must be a non-negative number of seconds." });
    }
    if (typeof watchedDelta !== "number" || !Number.isFinite(watchedDelta) || watchedDelta < 0 || watchedDelta > 24 * 60 * 60) {
      return res.status(400).json({ message: "Watched time must be a valid number of seconds." });
    }
    const positionSeconds = Math.min(position, video.durationSeconds);
    const update = {
      $set: { positionSeconds },
      $inc: { watchedSeconds: watchedDelta },
    };
    const record = await WatchProgress.findOneAndUpdate(
      { viewer: req.user._id, videoid: video._id },
      update,
      { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
    );
    return res.json(progressPayload(record, video));
  } catch (error) { return next(error); }
};

export const getWatchHistory = async (req, res, next) => {
  try {
    const entries = await History.find({ viewer: req.user._id }).sort({ viewedon: -1 }).limit(100).lean();
    const ids = entries.map((entry) => entry.videoid);
    const files = await Video.find({ _id: { $in: ids } }).lean();
    const subscription = await readSubscription(req.user._id);
    const byId = new Map((await Promise.all(files.map(withMetadata))).map((file) => [String(file._id), file]));
    res.set("Cache-Control", "private, no-store");
    return res.json(entries.flatMap((entry) => {
      const file = byId.get(String(entry.videoid));
      return file ? [{ viewedOn: entry.viewedon, video: { ...publicVideo(file, req.user, subscription), canWatch: !file.mediaUnavailable && canWatchVideo(file, req.user, subscription) } }] : [];
    }));
  } catch (error) { return next(error); }
};
