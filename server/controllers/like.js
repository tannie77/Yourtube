import mongoose from "mongoose";
import Video from "../Modals/video.js";
import Like from "../Modals/like.js";
import { publicVideo, withMetadata } from "./video.js";
import { readSubscription } from "../subscriptions/state.js";
import { canWatchVideo } from "../subscriptions/video-access.js";

function validVideoId(req, res) {
  if (mongoose.isValidObjectId(req.params.videoId)) return true;
  res.status(404).json({ message: "Video not found." });
  return false;
}

export async function getallLikedVideo(req, res, next) {
  try {
    const [entries, subscription] = await Promise.all([
      Like.find({ viewer: req.user._id }).sort({ likedon: -1, createdAt: -1 }).lean(),
      readSubscription(req.user._id),
    ]);
    const files = await Video.find({ _id: { $in: entries.map((entry) => entry.videoid) } }).lean();
    const byId = new Map((await Promise.all(files.map(withMetadata))).map((file) => [String(file._id), file]));
    res.set("Cache-Control", "private, no-store");
    return res.json(entries.flatMap((entry) => {
      const file = byId.get(String(entry.videoid));
      return file ? [{
        likedOn: entry.likedon || entry.createdAt,
        video: {
          ...publicVideo(file, req.user, subscription),
          canWatch: !file.mediaUnavailable && canWatchVideo(file, req.user, subscription),
          likedByViewer: true,
        },
      }] : [];
    }));
  } catch (error) { return next(error); }
}

export async function addLike(req, res, next) {
  if (!validVideoId(req, res)) return;
  try {
    const video = await Video.findById(req.params.videoId).select("Like").lean();
    if (!video) return res.status(404).json({ message: "Video not found." });
    const result = await Like.updateOne(
      { viewer: req.user._id, videoid: video._id },
      { $setOnInsert: { viewer: req.user._id, videoid: video._id, likedon: new Date() } },
      { upsert: true },
    );
    const current = result.upsertedCount
      ? await Video.findByIdAndUpdate(video._id, { $inc: { Like: 1 } }, { new: true }).select("Like").lean()
      : await Video.findById(video._id).select("Like").lean();
    res.set("Cache-Control", "private, no-store");
    return res.json({ liked: true, likes: current?.Like || 0 });
  } catch (error) {
    if (error?.code === 11000) {
      const current = await Video.findById(req.params.videoId).select("Like").lean();
      res.set("Cache-Control", "private, no-store");
      return res.json({ liked: true, likes: current?.Like || 0 });
    }
    return next(error);
  }
}

export async function removeLike(req, res, next) {
  if (!validVideoId(req, res)) return;
  try {
    const video = await Video.findById(req.params.videoId).select("Like").lean();
    if (!video) return res.status(404).json({ message: "Video not found." });
    const result = await Like.deleteOne({ viewer: req.user._id, videoid: video._id });
    if (result.deletedCount) {
      await Video.updateOne({ _id: video._id, Like: { $gt: 0 } }, { $inc: { Like: -1 } });
    }
    const current = await Video.findById(video._id).select("Like").lean();
    res.set("Cache-Control", "private, no-store");
    return res.json({ liked: false, likes: current?.Like || 0 });
  } catch (error) { return next(error); }
}
