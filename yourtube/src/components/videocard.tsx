import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import VideoThumbnail from "./VideoThumbnail";
import { VideoRecord } from "@/lib/video-media";
import VideoLibraryButton from "./VideoLibraryButton";

export default function VideoCard({ video }: { video: VideoRecord }) {
  return (
    <article className="yt-video-card">
      <Link href={`/watch/${video._id}`} className="yt-video-card-link" aria-label={`Watch ${video.videotitle}`}>
        <VideoThumbnail video={video} />
        <div className="yt-card-details">
          <span className="yt-channel-avatar" aria-hidden="true">{video.videochanel?.[0]?.toUpperCase() || "Y"}</span>
          <div className="min-w-0">
            <h3 className="yt-video-title">{video.videotitle}</h3>
            <p className="yt-video-meta">{video.videochanel}</p>
            <p className="yt-video-meta">{(video.views || 0).toLocaleString()} views · {formatDistanceToNow(new Date(video.createdAt))} ago</p>
          </div>
        </div>
      </Link>
      <div className="yt-card-actions" aria-label={`Actions for ${video.videotitle}`}>
        <VideoLibraryButton video={video} kind="like" compact showCount />
        <VideoLibraryButton video={video} kind="watchLater" compact />
      </div>
    </article>
  );
}
