import { LockKeyhole, Play, VideoOff } from "lucide-react";
import { formatDuration, VideoRecord, videoPreviewUrl } from "@/lib/video-media";

export default function VideoThumbnail({ video }: { video: VideoRecord }) {
  const duration = formatDuration(video.durationSeconds);
  return (
    <div className="yt-thumb">
      {video.canWatch && (video.previewCount || 0) > 0 ? (
        <img src={videoPreviewUrl(video._id)} alt="" loading="lazy" />
      ) : (
        <div className="yt-thumb-fallback">
          {video.mediaUnavailable ? <VideoOff aria-hidden="true" /> : video.canWatch ? <Play aria-hidden="true" fill="currentColor" /> : <LockKeyhole aria-hidden="true" />}
        </div>
      )}
      {duration && <span className="yt-thumb-duration">{duration}</span>}
      {!video.mediaUnavailable && (video.isCourse || video.earlyAccessActive || !video.canWatch) && <span className="yt-thumb-badge">{video.isCourse ? "Gold course" : video.earlyAccessActive ? "Gold early access" : "Members only"}</span>}
    </div>
  );
}
