import { useEffect, useState } from "react";
import { Clock3, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import axiosInstance from "@/lib/axiosinstance";
import type { VideoRecord } from "@/lib/video-media";

export type LibraryAction = "like" | "watchLater";

export default function VideoLibraryButton({ video, kind, compact = false, showCount = false, onChange }: {
  video: VideoRecord;
  kind: LibraryAction;
  compact?: boolean;
  showCount?: boolean;
  onChange?: (active: boolean) => void;
}) {
  const initialActive = kind === "like" ? Boolean(video.likedByViewer) : Boolean(video.savedForLater);
  const [active, setActive] = useState(initialActive);
  const [likes, setLikes] = useState(video.Like || 0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setActive(initialActive);
    setLikes(video.Like || 0);
  }, [video._id, initialActive, video.Like]);

  const label = kind === "like" ? (active ? "Liked" : "Like") : (active ? "Saved" : "Watch later");
  const route = kind === "like" ? `/likes/${video._id}` : `/watch-later/${video._id}`;
  const Icon = kind === "like" ? ThumbsUp : Clock3;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const response = active ? await axiosInstance.delete(route) : await axiosInstance.put(route);
      const next = kind === "like" ? Boolean(response.data.liked) : Boolean(response.data.savedForLater);
      setActive(next);
      if (kind === "like") setLikes(response.data.likes ?? likes);
      onChange?.(next);
      toast.success(kind === "like" ? (next ? "Added to Liked videos" : "Removed from Liked videos") : (next ? "Added to Watch later" : "Removed from Watch later"));
    } catch {
      toast.error(kind === "like" ? "Could not update your likes" : "Could not update Watch later");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={`yt-pill-button yt-library-button${compact ? " yt-library-button--compact" : ""}`} aria-label={`${active ? "Remove" : "Add"} ${video.videotitle} ${active ? "from" : "to"} ${kind === "like" ? "Liked videos" : "Watch later"}`} aria-pressed={active} title={label} disabled={busy} onClick={toggle}>
      <Icon aria-hidden="true" fill={kind === "like" && active ? "currentColor" : "none"} />
      {compact ? (kind === "like" && showCount ? <span>{likes.toLocaleString()}</span> : null) : <span>{label}{kind === "like" && showCount ? ` · ${likes.toLocaleString()}` : ""}</span>}
    </button>
  );
}
