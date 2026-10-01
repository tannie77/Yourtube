import { formatDistanceToNow } from "date-fns";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { VideoRecord } from "@/lib/video-media";
import VideoLibraryButton from "./VideoLibraryButton";

export default function VideoInfo({ video }: { video: VideoRecord }) {
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Video link copied");
    } catch {
      toast.error("Could not copy the video link");
    }
  };

  return (
    <div>
      <h1 className="yt-watch-title">{video.videotitle}</h1>
      <div className="yt-video-info-row">
        <div className="yt-video-channel">
          <span className="yt-channel-avatar" aria-hidden="true">{video.videochanel?.[0]?.toUpperCase() || "Y"}</span>
          <div><p className="yt-video-channel-name">{video.videochanel}</p><p className="yt-video-meta">Creator</p></div>
        </div>
        <div className="yt-watch-actions">
          <VideoLibraryButton video={video} kind="like" showCount />
          <VideoLibraryButton video={video} kind="watchLater" />
          <button type="button" className="yt-pill-button" onClick={share}><Share2 aria-hidden="true" />Share</button>
        </div>
      </div>
      <div className="yt-watch-stats">{(video.views || 0).toLocaleString()} views · Published {formatDistanceToNow(new Date(video.createdAt))} ago</div>
    </div>
  );
}
