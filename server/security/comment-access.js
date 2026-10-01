import Video from "../Modals/video.js";
import { readSubscription } from "../subscriptions/state.js";
import { canWatchVideo } from "../subscriptions/video-access.js";

export function validCommentId(value) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

export async function accessibleVideo(request, response, videoId) {
  if (!validCommentId(videoId)) {
    response.status(404).json({ message: "Video not found." });
    return null;
  }
  const video = await Video.findById(videoId).lean();
  if (!video) {
    response.status(404).json({ message: "Video not found." });
    return null;
  }
  const subscription = await readSubscription(request.user._id);
  if (!canWatchVideo(video, request.user, subscription)) {
    response.status(403).json({ code: "PLAN_REQUIRED", message: "This conversation needs the video's membership plan." });
    return null;
  }
  return video;
}
