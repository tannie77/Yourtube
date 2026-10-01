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
      {!video.canWatch && !video.mediaUnavailable && <span className="yt-thumb-badge">Members only</span>}
    </div>
  );
}
