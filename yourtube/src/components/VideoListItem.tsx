import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { VideoRecord } from "@/lib/video-media";
import VideoThumbnail from "./VideoThumbnail";

export default function VideoListItem({ video, compact = false, caption }: { video: VideoRecord; compact?: boolean; caption?: string }) {
  return (
    <Link href={`/watch/${video._id}`} className={`yt-video-row${compact ? " yt-video-row--compact" : ""}`} aria-label={`Watch ${video.videotitle}`}>
      <div className="yt-video-row-thumb"><VideoThumbnail video={video} /></div>
      <div className="yt-video-row-body">
        <h3 className="yt-video-title">{video.videotitle}</h3>
        <p className="yt-video-meta">{video.videochanel}</p>
        <p className="yt-video-meta">{(video.views || 0).toLocaleString()} views · {formatDistanceToNow(new Date(video.createdAt))} ago</p>
        {caption && <p className="yt-video-row-caption">{caption}</p>}
      </div>
    </Link>
  );
}
