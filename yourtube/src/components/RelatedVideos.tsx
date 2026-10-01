import { VideoRecord } from "@/lib/video-media";
import VideoListItem from "./VideoListItem";

export default function RelatedVideos({ videos }: { videos: VideoRecord[] }) {
  return <div className="yt-related-list">{videos.map((video) => <VideoListItem key={video._id} video={video} compact />)}</div>;
}
