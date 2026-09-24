import { stat } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import Video from "../Modals/video.js";
import DownloadRecord from "../Modals/DownloadRecord.js";
import { uploadDirectory } from "../filehelp/filehelp.js";
import { readSubscription } from "../subscriptions/state.js";
import { availableQualities, canWatchVideo, requiredVideoPlan } from "../subscriptions/video-access.js";
import { assetStem } from "../video/assets.js";
import { acquireDownloadWindow, downloadUsageSnapshot, finishDownload, reserveDownload, settleDownloadWindow } from "../video/download-usage.js";
import { storedPath, withMetadata } from "./video.js";

function attachmentName(title, quality) {
  const clean = title.normalize("NFC").replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/gu, "-").slice(0, 80) || "vidcircle-video";
  return `${clean}-${quality}.mp4`;
}

function clientDetails(userAgent) {
  const agent = String(userAgent || "");
  const browser = /Edg\//i.test(agent) ? "Edge" : /Firefox\//i.test(agent) ? "Firefox" : /Chrome\//i.test(agent) ? "Chrome" : /Safari\//i.test(agent) ? "Safari" : "Unknown browser";
  const device = /iPhone/i.test(agent) ? "iPhone" : /iPad/i.test(agent) ? "iPad" : /Android/i.test(agent) ? "Android device" : /Windows/i.test(agent) ? "Windows computer" : /Macintosh|Mac OS X/i.test(agent) ? "Mac computer" : /Linux/i.test(agent) ? "Linux computer" : "Unknown device";
  return { browser, device };
}

export async function getDownloadUsage(request, response, next) {
  try {
    const subscription = await readSubscription(request.user._id);
    response.set("Cache-Control", "private, no-store");
    return response.json(await downloadUsageSnapshot(request.user._id, subscription));
  } catch (error) {
    return next(error);
  }
}

export async function getDownloads(request, response, next) {
  try {
    const records = await DownloadRecord.find({ userId: request.user._id }).sort({ createdAt: -1 }).lean();
    const videos = await Video.find({ _id: { $in: records.map((record) => record.videoId) } })
      .select("videotitle filepath previewCount").lean();
    const byId = new Map(videos.map((video) => [String(video._id), video]));
    response.set("Cache-Control", "private, no-store");
    return response.json(records.map((record) => {
      const video = byId.get(String(record.videoId));
      const fallbackClient = clientDetails(record.userAgent);
      return {
        id: String(record._id), videoId: String(record.videoId),
        title: record.videoTitle || video?.videotitle || "Video no longer available",
        videoAvailable: Boolean(video), thumbnailAvailable: Boolean(video?.previewCount),
        startedAt: record.createdAt, finishedAt: record.finishedAt,
        status: record.status, failureReason: record.failureReason || null,
        planId: record.planId, quality: record.quality,
        fileSize: record.fileSize, browser: record.browser || fallbackClient.browser,
        device: record.device || fallbackClient.device,
      };
    }));
  } catch (error) {
    return next(error);
  }
}

export async function getDownloadThumbnail(request, response, next) {
  response.set("Cache-Control", "private, no-store");
  response.set("X-Content-Type-Options", "nosniff");
  if (!mongoose.isValidObjectId(request.params.recordId)) return response.status(404).json({ message: "Download not found." });
  try {
    const record = await DownloadRecord.findOne({ _id: request.params.recordId, userId: request.user._id }).lean();
    if (!record) return response.status(404).json({ message: "Download not found." });
    const video = await Video.findById(record.videoId).select("filepath previewCount").lean();
    if (!video?.previewCount) return response.status(404).json({ message: "Thumbnail unavailable." });
    const stem = assetStem(video);
    if (!/^[a-f0-9-]{36}$/i.test(stem)) return response.status(404).json({ message: "Thumbnail unavailable." });
    return response.sendFile(`${stem}-preview-01.jpg`, {
      root: uploadDirectory, dotfiles: "deny", cacheControl: false, lastModified: false,
    });
  } catch (error) {
    return next(error);
  }
}

export async function downloadVideo(request, response, next) {
  response.set("Cache-Control", "private, no-store");
  response.set("X-Content-Type-Options", "nosniff");
  const requestStartedAt = new Date();
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ message: "Video not found." });
  if (request.headers.range || request.headers["if-range"] || request.headers["if-none-match"] || request.headers["if-modified-since"]) {
    return response.status(400).json({ message: "Downloads must request the complete file." });
  }

  try {
    const stored = await Video.findById(request.params.id).lean();
    if (!stored) return response.status(404).json({ message: "Video not found." });
    const video = await withMetadata(stored);
    if (video.mediaUnavailable) return response.status(404).json({ message: "Video file unavailable." });

    const subscription = await readSubscription(request.user._id, requestStartedAt);
    if (!canWatchVideo(video, request.user, subscription, requestStartedAt)) {
      return response.status(403).json({ code: "PLAN_REQUIRED", requiredPlanId: requiredVideoPlan(video, requestStartedAt), message: "This video needs a higher membership plan." });
    }

    const selected = availableQualities(video, request.user, subscription, requestStartedAt).filter((item) => item.allowed).at(-1);
    if (!selected) return response.status(404).json({ message: "Video file unavailable." });
    if (selected.filename && !/^[a-f0-9-]{36}(?:-(?:480p|720p|1080p|4K))?\.mp4$/i.test(selected.filename)) {
      return response.status(404).json({ message: "Video file unavailable." });
    }
    const filePath = selected.filename ? path.join(uploadDirectory, selected.filename) : storedPath(video);
    if (!filePath) return response.status(404).json({ message: "Video file unavailable." });
    let file;
    try { file = await stat(filePath); } catch { return response.status(404).json({ message: "Video file unavailable." }); }
    if (!file.isFile()) return response.status(404).json({ message: "Video file unavailable." });

    const recordId = new mongoose.Types.ObjectId();
    const window = await acquireDownloadWindow(request.user._id, video._id, recordId, requestStartedAt);
    if (!window.allowed) {
      if (window.retryAt) response.set("Retry-After", String(Math.max(1, Math.ceil((window.retryAt.getTime() - Date.now()) / 1000))));
      return response.status(409).json({
        code: "DUPLICATE_DOWNLOAD_WINDOW", retryAt: window.retryAt,
        message: window.retryAt ? "You downloaded this video recently. Try it again after the 30-minute window; this request did not use another slot." : "This video is already downloading. Wait for it to finish before trying again.",
      });
    }

    let reservation;
    let record;
    try {
      reservation = await reserveDownload(request.user._id, subscription, requestStartedAt);
      if (!reservation.allowed) {
        await settleDownloadWindow(window, false);
        return response.status(429).json({ code: "DOWNLOAD_LIMIT_REACHED", message: "Today's download allowance is used up. Try again after midnight IST or choose a higher plan." });
      }
      const userAgent = String(request.headers["user-agent"] || "").slice(0, 512);
      record = await DownloadRecord.create({
        _id: recordId,
        userId: request.user._id, videoId: video._id, videoTitle: video.videotitle, dayKey: reservation.dayKey,
        planId: reservation.planId, quality: selected.quality, fileSize: file.size,
        ip: request.ip || "", userAgent, ...clientDetails(userAgent),
      });
    } catch (error) {
      if (reservation?.allowed) await finishDownload(reservation, false).catch((failure) => console.error("Could not release download slot:", failure));
      await settleDownloadWindow(window, false).catch((failure) => console.error("Could not release duplicate guard:", failure));
      throw error;
    }

    let settled = false;
    async function settle(completed, failureReason = null) {
      if (settled) return;
      settled = true;
      try {
        const finishedAt = new Date();
        const changed = await DownloadRecord.updateOne(
          { _id: record._id, status: "reserved" },
          { $set: { status: completed ? "completed" : "failed", failureReason, finishedAt } },
        );
        if (!changed.modifiedCount) return;
        const usage = await finishDownload(reservation, completed);
        if (!usage.matchedCount) console.error("Download record completed but its daily counter was not updated:", String(record._id));
        await settleDownloadWindow(window, completed, finishedAt);
      } catch (error) {
        console.error("Could not finalise download:", error);
      }
    }

    response.on("close", () => { if (!response.writableFinished) void settle(false, "connection_closed"); });
    if (response.destroyed) {
      void settle(false, "connection_closed");
      return;
    }
    try {
      response.set("X-Download-Quality", selected.quality);
      response.attachment(attachmentName(video.videotitle, selected.quality));
      return response.sendFile(path.basename(filePath), {
        root: uploadDirectory, dotfiles: "deny", acceptRanges: false, cacheControl: false, lastModified: false,
      }, (error) => {
        void settle(!error, error ? "transfer_failed" : null);
        if (!error || response.destroyed || ["EPIPE", "ECONNRESET", "ECONNABORTED"].includes(error.code)) return;
        if (response.headersSent) return next(error);
        return response.status(error.status || 500).json({ message: "Video download failed." });
      });
    } catch (error) {
      void settle(false, "transfer_failed");
      return next(error);
    }
  } catch (error) {
    return next(error);
  }
}
