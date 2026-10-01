import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Clock3, ThumbsUp } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import type { VideoRecord } from "@/lib/video-media";
import EmptyState from "./EmptyState";
import VideoLibraryButton, { type LibraryAction } from "./VideoLibraryButton";
import VideoListItem from "./VideoListItem";

interface LibraryEntry { likedOn?: string; savedOn?: string; video: VideoRecord }

export default function LibraryContent({ kind }: { kind: LibraryAction }) {
  const { user, loading: authLoading } = useUser();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const liked = kind === "like";

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setEntries([]); setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError(false);
    axiosInstance.get<LibraryEntry[]>(liked ? "/likes/me" : "/watch-later/me")
      .then((response) => { if (active) setEntries(response.data); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, user?._id, liked]);

  const Icon = liked ? ThumbsUp : Clock3;
  const name = liked ? "Liked videos" : "Watch later";
  if (authLoading || loading) return <p className="yt-subtle py-12 text-center text-sm">Loading {name.toLowerCase()}…</p>;
  if (error) return <EmptyState icon={Icon} title={`${name} couldn't load`} description="Please refresh the page and try again." />;
  if (entries.length === 0) return <EmptyState icon={Icon} title={liked ? "No liked videos yet" : "Nothing saved for later yet"} description={liked ? "Like a video to keep it here." : "Save a video from the feed or watch page and find it here."} action={<Link href="/" className="yt-empty-action">Browse videos</Link>} />;
  return (
    <div>
      <p className="yt-subtle mb-5 text-sm">{entries.length} {entries.length === 1 ? "video" : "videos"}</p>
      <div className="yt-library-list">
        {entries.map((entry) => <div className="yt-library-item" key={entry.video._id}>
          <VideoListItem video={entry.video} caption={`${liked ? "Liked" : "Saved"} ${formatDistanceToNow(new Date((liked ? entry.likedOn : entry.savedOn) || entry.video.createdAt))} ago`} />
          <VideoLibraryButton video={entry.video} kind={kind} compact onChange={(active) => { if (!active) setEntries((current) => current.filter((item) => item.video._id !== entry.video._id)); }} />
        </div>)}
      </div>
    </div>
  );
}
