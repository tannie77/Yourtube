import ChannelSubscription from "../Modals/ChannelSubscription.js";
import User from "../Modals/Auth.js";
import Video from "../Modals/video.js";
import Like from "../Modals/like.js";
import WatchLater from "../Modals/watchlater.js";
import { publicVideo, withMetadata } from "./video.js";
import { readSubscription } from "../subscriptions/state.js";
import { canWatchVideo } from "../subscriptions/video-access.js";

async function findChannel(request, response) {
  if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
    response.status(404).json({ message: "Channel not found." });
    return null;
  }
  const channel = await User.findOne({ _id: request.params.id, channelname: { $exists: true, $ne: "" } })
    .select("channelname image description").lean();
  if (!channel) response.status(404).json({ message: "Channel not found." });
  return channel;
}

export async function myChannelSubscriptions(request, response, next) {
  try {
    const relations = await ChannelSubscription.find({ subscriber: request.user._id })
      .sort({ createdAt: -1 }).lean();
    const ids = relations.map((item) => item.channel);
    const channels = await User.find({ _id: { $in: ids }, channelname: { $exists: true, $ne: "" } })
      .select("channelname image description").lean();
    const byId = new Map(channels.map((channel) => [String(channel._id), channel]));
    const visibleChannels = relations.flatMap((item) => {
      const channel = byId.get(String(item.channel));
      return channel ? [{ ...channel, subscribedOn: item.createdAt }] : [];
    });
    const channelIds = visibleChannels.map((channel) => String(channel._id));
    const [files, membership, likes, saved] = await Promise.all([
      Video.find({ uploader: { $in: channelIds } }).sort({ createdAt: -1 }).limit(100).lean(),
      readSubscription(request.user._id),
      Like.find({ viewer: request.user._id }).select("videoid").lean(),
      WatchLater.find({ viewer: request.user._id }).select("videoid").lean(),
    ]);
    const likedIds = new Set(likes.map((item) => String(item.videoid)));
    const savedIds = new Set(saved.map((item) => String(item.videoid)));
    const videos = await Promise.all(files.map(withMetadata));
    response.set("Cache-Control", "private, no-store");
    return response.json({
      channels: visibleChannels,
      videos: videos.map((video) => ({
        ...publicVideo(video, request.user, membership),
        canWatch: !video.mediaUnavailable && canWatchVideo(video, request.user, membership),
        likedByViewer: likedIds.has(String(video._id)),
        savedForLater: savedIds.has(String(video._id)),
      })),
    });
  } catch (error) { return next(error); }
}

export async function channelSubscriptionStatus(request, response, next) {
  try {
    const channel = await findChannel(request, response);
    if (!channel) return;
    const [relation, subscriberCount] = await Promise.all([
      ChannelSubscription.exists({ subscriber: request.user._id, channel: channel._id }),
      ChannelSubscription.countDocuments({ channel: channel._id }),
    ]);
    response.set("Cache-Control", "private, no-store");
    return response.json({ subscribed: Boolean(relation), subscriberCount });
  } catch (error) { return next(error); }
}

export async function subscribeChannel(request, response, next) {
  try {
    const channel = await findChannel(request, response);
    if (!channel) return;
    if (String(channel._id) === String(request.user._id)) {
      return response.status(403).json({ message: "You cannot subscribe to your own channel." });
    }
    await ChannelSubscription.updateOne(
      { subscriber: request.user._id, channel: channel._id },
      { $setOnInsert: { subscriber: request.user._id, channel: channel._id } },
      { upsert: true },
    );
    response.set("Cache-Control", "private, no-store");
    return response.json({ subscribed: true, subscriberCount: await ChannelSubscription.countDocuments({ channel: channel._id }) });
  } catch (error) {
    if (error?.code === 11000) return channelSubscriptionStatus(request, response, next);
    return next(error);
  }
}

export async function unsubscribeChannel(request, response, next) {
  try {
    const channel = await findChannel(request, response);
    if (!channel) return;
    await ChannelSubscription.deleteOne({ subscriber: request.user._id, channel: channel._id });
    response.set("Cache-Control", "private, no-store");
    return response.json({ subscribed: false, subscriberCount: await ChannelSubscription.countDocuments({ channel: channel._id }) });
  } catch (error) { return next(error); }
}
