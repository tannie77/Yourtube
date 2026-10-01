import { useEffect, useState } from "react";
import Link from "next/link";
import { Clapperboard } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import { VideoRecord } from "@/lib/video-media";
import type { FeedSort } from "./category-tabs";
import EmptyState from "./EmptyState";
import VideoCard from "./videocard";

export default function Videogrid({ sort = "all" }: { sort?: FeedSort }) {
  const { user, loading: authLoading } = useUser();
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setVideos([]); setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError(false);
    axiosInstance.get<VideoRecord[]>("/video/getall")
      .then((response) => { if (active) setVideos(response.data); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, user?._id]);

  if (authLoading || loading) return (
    <div className="yt-loading-grid" aria-label="Loading videos">
      {Array.from({ length: 6 }, (_, index) => <div className="yt-skeleton-card" key={index}><div className="yt-skeleton" /><div className="yt-skeleton-line" /><div className="yt-skeleton-line" /></div>)}
    </div>
  );
  if (error) return <EmptyState icon={Clapperboard} title="Videos couldn't load" description="Please refresh the page and try again." />;
  if (videos.length === 0) return (
    <EmptyState icon={Clapperboard} title="Your feed is ready for videos" description="Videos from YourTube creators will appear here. Create a channel to share the first one."
      action={user?.channelname ? <Link href={`/channel/${user._id}#upload`} className="yt-empty-action">Upload a video</Link> : undefined} />
  );

  const sorted = [...videos];
  if (sort === "recent") sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (sort === "popular") sorted.sort((a, b) => (b.views || 0) - (a.views || 0));
  return <div className="yt-grid">{sorted.map((video) => <VideoCard key={video._id} video={video} />)}</div>;
}
