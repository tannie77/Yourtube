import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { History } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import { VideoRecord } from "@/lib/video-media";
import EmptyState from "./EmptyState";
import VideoListItem from "./VideoListItem";

interface HistoryEntry { viewedOn: string; video: VideoRecord }

export default function HistoryContent() {
  const { user, loading: authLoading } = useUser();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError(false);
    axiosInstance.get<HistoryEntry[]>("/video/history/me")
      .then((response) => { if (active) setHistory(response.data); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, user?._id]);

  if (authLoading || loading) return <p className="yt-subtle py-12 text-center text-sm">Loading history…</p>;
  if (error) return <EmptyState icon={History} title="History couldn't load" description="Please refresh the page and try again." />;
  if (history.length === 0) return <EmptyState icon={History} title="No watch history yet" description="Videos you watch will appear here so you can pick up where you left off." action={<Link href="/" className="yt-empty-action">Browse videos</Link>} />;
  return (
    <div>
      <p className="yt-subtle mb-5 text-sm">{history.length} {history.length === 1 ? "video" : "videos"}</p>
      <div className="space-y-5">
        {history.map(({ viewedOn, video }) => <VideoListItem key={video._id} video={video} caption={`Watched ${formatDistanceToNow(new Date(viewedOn))} ago`} />)}
      </div>
    </div>
  );
}
