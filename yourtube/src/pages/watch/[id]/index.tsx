import { useRouter } from "next/router";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Clapperboard, Clock3, LockKeyhole } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import { VideoRecord } from "@/lib/video-media";
import EmptyState from "@/components/EmptyState";
import RelatedVideos from "@/components/RelatedVideos";
import VideoInfo from "@/components/VideoInfo";
import VideoPlayer from "@/components/Videopplayer";
import DownloadPanel from "@/components/DownloadPanel";
import Comments from "@/components/Comments";

type WatchUsage = { planId: string; limitMinutes: number | null; secondsReserved: number; remainingSeconds: number | null; dayKey: string };

export default function WatchPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, loading: authLoading } = useUser();
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [theatreMode, setTheatreMode] = useState(false);
  const [usage, setUsage] = useState<WatchUsage | null>(null);
  const [usageError, setUsageError] = useState(false);

  const refreshUsage = useCallback(() => {
    void axiosInstance.get<WatchUsage>("/video/usage/me")
      .then((response) => { setUsage(response.data); setUsageError(false); })
      .catch(() => setUsageError(true));
  }, []);

  useEffect(() => {
    if (authLoading || !router.isReady) return;
    if (!user) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError(false);
    axiosInstance.get<VideoRecord[]>("/video/getall")
      .then((response) => { if (active) setVideos(response.data); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, router.isReady, user?._id, id]);

  useEffect(() => {
    if (!authLoading && user) refreshUsage();
    else setUsage(null);
  }, [authLoading, user?._id, refreshUsage]);

  if (authLoading || loading || !router.isReady) return <main className="yt-page yt-watch-page"><p className="yt-subtle py-12 text-center text-sm">Loading video…</p></main>;
  if (error) return <main className="yt-page yt-watch-page"><EmptyState icon={Clapperboard} title="Video couldn't load" description="Please refresh the page and try again." /></main>;
  const video = videos.find((item) => item._id === id);
  if (!video) return <main className="yt-page yt-watch-page"><EmptyState icon={Clapperboard} title="Video not found" description="This video may have been removed or is no longer available." /></main>;
  const relatedVideos = videos.filter((item) => item._id !== video._id).slice(0, 12);
  const nextVideo = relatedVideos.find((item) => item.canWatch && !item.mediaUnavailable);

  return (
    <main className="yt-page yt-watch-page">
      <div className={`yt-watch-layout${theatreMode ? " is-theatre" : ""}${relatedVideos.length === 0 ? " is-solo" : ""}`}>
        <div className="min-w-0">
          {video.canWatch ? <VideoPlayer key={video._id} video={video} nextVideo={nextVideo} onLoaded={refreshUsage} theatreMode={theatreMode} onTheatreChange={setTheatreMode} /> : (
            <div className="yt-player-frame flex aspect-video flex-col items-center justify-center gap-3 p-8 text-center text-white">
              <LockKeyhole className="h-9 w-9" aria-hidden="true" />
              <p className="text-lg font-semibold">{video.mediaUnavailable ? "This video is unavailable" : "Members only"}</p>
              {!video.mediaUnavailable && <>
                <p className="max-w-sm text-sm text-zinc-300">This video requires the {video.accessPlan || "higher"} membership plan.</p>
                <Link className="yt-primary-button mt-3" href={`/membership?plan=${encodeURIComponent(video.accessPlan || "silver")}&next=${encodeURIComponent(`/watch/${video._id}`)}`}>View memberships</Link>
              </>}
            </div>
          )}
          <VideoInfo video={video} />
          {video.canWatch && video.showLocalAd && <aside className="yt-downloads-surface yt-downloads-card mt-6" aria-label="Local demo advertisement"><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--yt-red)]">Local demo ad</p><p className="mt-1 text-sm text-[var(--yt-muted)]">Silver and Gold hide this local placeholder. No external ad network is connected.</p></aside>}
          {(usage || usageError) && <aside className="yt-downloads-surface yt-downloads-card mt-6 flex items-start gap-3" aria-label="Today's watch allowance"><Clock3 className="mt-0.5 size-4 shrink-0 text-[var(--yt-red)]" aria-hidden="true" /><div><h2 className="text-sm font-semibold text-[var(--yt-text)]">Today&apos;s watch allowance</h2>{usage ? <><p className="mt-1 text-sm text-[var(--yt-muted)]">{usage.remainingSeconds === null ? "Unlimited on Gold" : `${Math.floor(usage.remainingSeconds / 60)} of ${usage.limitMinutes} minutes remaining`} · resets at midnight IST</p><p className="mt-1 text-xs text-[var(--yt-muted)]">A video&apos;s full duration counts once when you first play it each day. This is an approximate local meter.</p></> : <p className="mt-1 text-sm text-[var(--yt-muted)]">Allowance unavailable. Refresh the page to try again.</p>}</div></aside>}
          {video.canWatch && !video.mediaUnavailable && <DownloadPanel key={`download-${video._id}`} video={video} />}
          {video.canWatch && !video.mediaUnavailable && <Comments key={`comments-${video._id}`} videoId={video._id} />}
        </div>
        {relatedVideos.length > 0 && <aside aria-label="Related videos">
          <h2 className="yt-related-title">Up next</h2>
          <RelatedVideos videos={relatedVideos} />
        </aside>}
      </div>
    </main>
  );
}
