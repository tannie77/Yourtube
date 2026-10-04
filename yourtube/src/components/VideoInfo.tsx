import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { VideoRecord } from "@/lib/video-media";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import VideoLibraryButton from "./VideoLibraryButton";

export default function VideoInfo({ video }: { video: VideoRecord }) {
  const { user } = useUser();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  useEffect(() => {
    if (!user || user._id === video.uploader) return;
    let active = true;
    setSubscribed(null);
    axiosInstance.get<{ subscribed: boolean }>(`/channels/${encodeURIComponent(video.uploader)}/subscription`)
      .then(({ data }) => { if (active) setSubscribed(data.subscribed); })
      .catch(() => { if (active) toast.error("Could not load channel subscription."); });
    return () => { active = false; };
  }, [user?._id, video.uploader]);

  const toggleSubscription = async () => {
    if (subscribed === null || subscriptionBusy) return;
    setSubscriptionBusy(true);
    try {
      const method = subscribed ? "delete" : "put";
      const { data } = await axiosInstance[method]<{ subscribed: boolean }>(`/channels/${encodeURIComponent(video.uploader)}/subscription`);
      setSubscribed(data.subscribed);
      toast.success(data.subscribed ? "Subscribed to channel" : "Unsubscribed from channel");
    } catch {
      toast.error("Could not update channel subscription.");
    } finally {
      setSubscriptionBusy(false);
    }
  };

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
          {user && user._id !== video.uploader && <button type="button" className={subscribed ? "yt-pill-button" : "yt-primary-button"}
            aria-pressed={subscribed === true} disabled={subscribed === null || subscriptionBusy} onClick={toggleSubscription}>
            {subscribed ? "Subscribed" : "Subscribe"}
          </button>}
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
