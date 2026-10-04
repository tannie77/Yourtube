import Link from "next/link";
import { useEffect, useState } from "react";
import { Clapperboard, UsersRound } from "lucide-react";
import { toast } from "sonner";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import type { VideoRecord } from "@/lib/video-media";
import EmptyState from "@/components/EmptyState";
import VideoCard from "@/components/videocard";

type Channel = { _id: string; channelname: string; image?: string; description?: string };
type ChannelFeed = { channels: Channel[]; videos: VideoRecord[] };

export default function SubscriptionsPage() {
  const { user, loading: authLoading } = useUser();
  const [feed, setFeed] = useState<ChannelFeed>({ channels: [], videos: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError(false);
    axiosInstance.get<ChannelFeed>("/channels/subscriptions/me")
      .then(({ data }) => { if (active) setFeed(data); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, user?._id]);

  const unsubscribe = async (id: string) => {
    setRemoving(id);
    try {
      await axiosInstance.delete(`/channels/${encodeURIComponent(id)}/subscription`);
      const { data } = await axiosInstance.get<ChannelFeed>("/channels/subscriptions/me");
      setFeed(data);
      toast.success("Unsubscribed from channel");
    } catch {
      toast.error("Could not unsubscribe from channel.");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <main className="yt-page">
      <div className="yt-page-header"><div><h1 className="yt-page-title">Subscriptions</h1><p className="yt-page-description">Recent videos from channels you follow.</p></div></div>
      {authLoading || loading ? <p className="yt-subtle">Loading subscriptions…</p> : !user ? (
        <EmptyState icon={UsersRound} title="Sign in to see subscriptions" description="Follow creators to see their videos here."
          action={<Link href="/sign-in" className="yt-empty-action">Sign in</Link>} />
      ) : error ? (
        <EmptyState icon={Clapperboard} title="Subscriptions could not load" description="Please refresh the page and try again." />
      ) : feed.channels.length === 0 ? (
        <EmptyState icon={UsersRound} title="No channel subscriptions yet" description="Open a video and subscribe to its creator to build your feed."
          action={<Link href="/" className="yt-empty-action">Explore videos</Link>} />
      ) : <>
        <section aria-label="Subscribed channels" className="yt-subscribed-channels">
          {feed.channels.map((channel) => <div className="yt-subscribed-channel" key={channel._id}>
            <span className="yt-channel-avatar" aria-hidden="true">{channel.image ? <img src={channel.image} alt="" /> : channel.channelname[0]?.toUpperCase()}</span>
            <span className="yt-subscribed-channel-name">{channel.channelname}</span>
            <button type="button" className="yt-pill-button" disabled={removing === channel._id} onClick={() => unsubscribe(channel._id)}>
              Unsubscribe
            </button>
          </div>)}
        </section>
        <h2 className="yt-section-title yt-subscriptions-heading">Latest videos</h2>
        {feed.videos.length ? <div className="yt-grid">{feed.videos.map((video) => <VideoCard key={video._id} video={video} />)}</div>
          : <p className="yt-feed-message">Your subscribed channels have not uploaded videos yet.</p>}
      </>}
    </main>
  );
}
