import mongoose from "mongoose";
import Video from "../Modals/video.js";
import WatchLater from "../Modals/watchlater.js";
import { publicVideo, withMetadata } from "./video.js";
import { readSubscription } from "../subscriptions/state.js";
import { canWatchVideo } from "../subscriptions/video-access.js";

function validVideoId(req, res) {
  if (mongoose.isValidObjectId(req.params.videoId)) return true;
  res.status(404).json({ message: "Video not found." });
  return false;
}

export async function getallwatchlater(req, res, next) {
  try {
    const [entries, subscription] = await Promise.all([
      WatchLater.find({ viewer: req.user._id }).sort({ savedon: -1, createdAt: -1 }).lean(),
      readSubscription(req.user._id),
    ]);
    const files = await Video.find({ _id: { $in: entries.map((entry) => entry.videoid) } }).lean();
    const byId = new Map((await Promise.all(files.map(withMetadata))).map((file) => [String(file._id), file]));
    res.set("Cache-Control", "private, no-store");
    return res.json(entries.flatMap((entry) => {
      const file = byId.get(String(entry.videoid));
      return file ? [{
        savedOn: entry.savedon || entry.createdAt,
        video: {
          ...publicVideo(file, req.user, subscription),
          canWatch: !file.mediaUnavailable && canWatchVideo(file, req.user, subscription),
          savedForLater: true,
        },
      }] : [];
    }));
  } catch (error) { return next(error); }
}

export async function addWatchLater(req, res, next) {
  if (!validVideoId(req, res)) return;
  try {
    const exists = await Video.exists({ _id: req.params.videoId });
    if (!exists) return res.status(404).json({ message: "Video not found." });
    await WatchLater.updateOne(
      { viewer: req.user._id, videoid: exists._id },
      { $setOnInsert: { viewer: req.user._id, videoid: exists._id, savedon: new Date() } },
      { upsert: true },
    );
    res.set("Cache-Control", "private, no-store");
    return res.json({ savedForLater: true });
  } catch (error) {
    if (error?.code === 11000) {
      res.set("Cache-Control", "private, no-store");
      return res.json({ savedForLater: true });
    }
    return next(error);
  }
}

export async function removeWatchLater(req, res, next) {
  if (!validVideoId(req, res)) return;
  try {
    const exists = await Video.exists({ _id: req.params.videoId });
    if (!exists) return res.status(404).json({ message: "Video not found." });
    await WatchLater.deleteOne({ viewer: req.user._id, videoid: exists._id });
    res.set("Cache-Control", "private, no-store");
    return res.json({ savedForLater: false });
  } catch (error) { return next(error); }
}
