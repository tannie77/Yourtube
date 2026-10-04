import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, SearchX } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import { VideoRecord } from "@/lib/video-media";
import EmptyState from "./EmptyState";
import VideoListItem from "./VideoListItem";

export default function SearchResult({ query }: { query: string }) {
  const { user, loading: authLoading } = useUser();
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !query.trim()) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError(false);
    axiosInstance.get<VideoRecord[]>("/video/getall")
      .then((response) => { if (active) setVideos(response.data); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, user?._id, query]);

  if (!query.trim()) return <EmptyState icon={Search} title="What would you like to watch?" description="Use the search bar above to find videos and creators." />;
  if (authLoading || loading) return <p className="yt-subtle py-12 text-center text-sm">Searching videos…</p>;
  if (!user) return <EmptyState icon={Search} title="Sign in to search videos" description="Explore videos from YourTube creators after signing in." action={<Link href="/sign-in" className="yt-empty-action">Sign in</Link>} />;
  if (error) return <EmptyState icon={SearchX} title="Search is unavailable" description="Please refresh the page and try again." />;
  const term = query.toLocaleLowerCase();
  const results = videos.filter((video) => video.videotitle.toLocaleLowerCase().includes(term) || video.videochanel.toLocaleLowerCase().includes(term));
  if (results.length === 0) return <EmptyState icon={SearchX} title="No matching videos" description={`We couldn't find any videos for “${query}”. Try a different search.`} />;
  return (
    <div>
      <p className="yt-subtle mb-5 text-sm">{results.length} {results.length === 1 ? "result" : "results"}</p>
      <div className="space-y-5">{results.map((video) => <VideoListItem key={video._id} video={video} />)}</div>
    </div>
  );
}
