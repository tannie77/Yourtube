import { Clapperboard } from "lucide-react";
import { VideoRecord } from "@/lib/video-media";
import EmptyState from "./EmptyState";
import VideoCard from "./videocard";

export default function ChannelVideos({ videos }: { videos: VideoRecord[] }) {
  return (
    <section aria-labelledby="channel-videos-title">
      <div className="mb-5 flex items-center gap-3"><h2 id="channel-videos-title" className="yt-section-title">Videos</h2><span className="yt-subtle text-sm">{videos.length}</span></div>
      {videos.length === 0 ? <EmptyState icon={Clapperboard} title="No uploads yet" description="Your videos will appear here after you upload the first one." /> : <div className="yt-grid">{videos.map((video) => <VideoCard key={video._id} video={video} />)}</div>}
    </section>
  );
}
