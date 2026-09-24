"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Clock3, Crown, Film, LockKeyhole, UserRound } from "lucide-react";
import Comments from "@/components/comments";
import DownloadPanel from "@/components/download-panel";
import LocalVideoCard from "@/components/local-video-card";
import Videoplayer from "@/components/Videoplayer";
import { useWorkspaceLayout } from "@/components/workspace-shell";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContent";
import { accessPlanName, addedDate, type LocalVideo } from "@/lib/local-video";

type VideoState = "loading" | "ready" | "error";
type WatchUsage = { planId: string; limitMinutes: number | null; secondsReserved: number; remainingSeconds: number | null; dayKey: string };

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const { setFocusMode } = useWorkspaceLayout();
  const [video, setVideo] = useState<LocalVideo | null>(null);
  const [related, setRelated] = useState<LocalVideo[]>([]);
  const [state, setState] = useState<VideoState>("loading");
  const [refreshKey, setRefreshKey] = useState(0);
  const [usage, setUsage] = useState<WatchUsage | null>(null);
  const [theatreMode, setTheatreMode] = useState(false);

  function refreshUsage() {
    void axiosInstance.get<WatchUsage>("/video/usage/me").then((response) => setUsage(response.data)).catch(() => {});
  }

  useEffect(() => {
    let active = true;
    axiosInstance.get<LocalVideo[]>("/video/getall")
      .then((response) => {
        if (!active) return;
        setVideo(response.data.find((item) => item._id === id) || null);
        setRelated(response.data.filter((item) => item._id !== id).slice(0, 4));
        setState("ready");
      })
      .catch(() => { if (active) setState("error"); });
    refreshUsage();
    return () => { active = false; };
  }, [id, refreshKey]);

  useEffect(() => () => setFocusMode(false), [setFocusMode]);

  function handleTheatreChange(enabled: boolean) {
    setTheatreMode(enabled);
    setFocusMode(enabled);
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#172033] [font-family:'Avenir_Next',Avenir,'Segoe_UI',ui-sans-serif,system-ui,sans-serif]">
      <div className="mx-auto max-w-[1510px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        {state === "loading" && <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_310px]" aria-label="Loading video"><div className="aspect-video animate-pulse rounded-[22px] bg-[#e8ebf0]" /><div className="h-64 animate-pulse rounded-2xl bg-[#e8ebf0]" /></div>}
        {state === "error" && <div className="rounded-[24px] border border-[#f3d5cf] bg-[#fff7f4] px-6 py-16 text-center"><h1 className="text-xl font-semibold text-[#7a3b31]">Could not load this video</h1><p className="mt-2 text-sm text-[#a56b60]">Check that the local API is running, then try again.</p><button type="button" className="mt-5 rounded-xl bg-[#ed6049] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#dc523c]" onClick={() => { setState("loading"); setRefreshKey((key) => key + 1); }}>Retry</button></div>}
        {state === "ready" && !video && <div className="rounded-[24px] border border-[#e8ebf0] bg-white px-6 py-16 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#fff0ec] text-[#e56a51]"><Film className="size-7" aria-hidden="true" /></span><h1 className="mt-5 text-xl font-semibold">Video not found</h1><p className="mt-2 text-sm text-[#7d8797]">This video is no longer in the local library.</p><Link href="/library" className="mt-5 inline-flex text-sm font-semibold text-[#dd604b] hover:underline">Browse the library</Link></div>}

        {state === "ready" && video && (
          <div className={`grid items-start gap-8 ${theatreMode ? "lg:grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_310px]"}`}>
            <div className="min-w-0 space-y-6">
              {video.canWatch ? <Videoplayer key={video._id} video={video} nextVideo={related.find((item) => item.canWatch)} onLoaded={refreshUsage} theatreMode={theatreMode} onTheatreChange={handleTheatreChange} /> : (
                <section className="flex aspect-video flex-col items-center justify-center rounded-[22px] bg-[#171b30] px-6 text-center text-white" aria-label="Video locked">
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-[#ffad95]"><LockKeyhole className="size-7" aria-hidden="true" /></span>
                  <h2 className="mt-5 text-xl font-semibold">{video.mediaUnavailable ? "Video unavailable" : `${accessPlanName(video.accessPlan)} plan required`}</h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-[#cbd0df]">{video.mediaUnavailable ? "The local MP4 is missing or unreadable." : video.earlyAccessActive ? "This video is in its seven-day Gold early-access window." : `This video is available with ${accessPlanName(video.accessPlan)} or a higher membership.`}</p>
                  <Link href="/subscriptions" className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-[#ed6049] px-5 text-sm font-semibold text-white hover:bg-[#da553f]"><Crown className="size-4" aria-hidden="true" /> Compare memberships</Link>
                </section>
              )}
              <section className="rounded-[22px] border border-[#e8ebf0] bg-white p-6 sm:p-7">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e16b55]">{video.canWatch ? "Now watching" : "Members-only video"} · Local MP4</p>
                <h1 className="mt-2 text-[clamp(1.5rem,2.5vw,2.1rem)] font-semibold leading-tight tracking-[-0.05em]">{video.videotitle}</h1>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#657286]">
                  {video.sourceQuality && <span className="rounded-full bg-[#f3f5f8] px-3 py-1.5">{video.sourceQuality} source</span>}
                  {video.earlyAccessActive && <span className="rounded-full bg-[#fff0ec] px-3 py-1.5 text-[#cc5a42]">Gold early access</span>}
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[#edf0f4] pt-5">
                  <div className="flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f5f2ff] text-[#7562a8]"><UserRound className="size-5" aria-hidden="true" /></span><div><p className="text-sm font-semibold text-[#344054]">{video.videochanel}</p><p className="text-xs text-[#929bab]">{addedDate(video.createdAt)}</p></div></div>
                  {user?._id === video.uploader && <Link href={`/channel/${user._id}`} className="text-sm font-semibold text-[#dd604b] hover:underline">Manage your channel</Link>}
                </div>
              </section>
              {video.canWatch && video.showLocalAd && <aside className="rounded-[22px] border border-[#e8ebf0] bg-white p-5" aria-label="Local demo advertisement"><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#ed6049]">Local demo ad</p><p className="mt-1 text-sm text-[#697486]">Ad-free viewing is included with Silver and Gold. This placeholder has no external ad network.</p></aside>}
              {usage && <aside className="flex items-start gap-3 rounded-[22px] border border-[#e8ebf0] bg-white p-5 text-sm text-[#697486]"><Clock3 className="mt-0.5 size-4 shrink-0 text-[#ed6049]" aria-hidden="true" /><div><p className="font-semibold text-[#344054]">Today&apos;s local watch allowance</p><p className="mt-1">{usage.remainingSeconds === null ? "Unlimited on Gold" : `${Math.floor(usage.remainingSeconds / 60)} of ${usage.limitMinutes} minutes remaining`} · resets at midnight IST</p><p className="mt-1 text-xs">A clip&apos;s full duration is counted once on first play each day. This is an approximate prototype meter.</p></div></aside>}
              {video.canWatch && <DownloadPanel key={video._id} video={video} />}
              <Comments videoId={video._id} />
              <Link href="/history" className="inline-flex px-1 text-sm font-semibold text-[#dd604b] hover:underline">View watch history</Link>
              {video.canWatch && <p className="px-1 text-xs leading-5 text-[#929bab]">Your position saves during playback and on pause. Completion uses watched playback time, not skipped time. New uploads support local quality choices, optional captions and timeline previews.</p>}
            </div>
            <aside className="min-w-0"><h2 className="mb-4 text-lg font-semibold tracking-[-0.04em]">More from the library</h2>{related.length ? <div className={`grid gap-4 sm:grid-cols-2 ${theatreMode ? "lg:grid-cols-4" : "lg:grid-cols-1"}`}>{related.map((item) => <LocalVideoCard key={item._id} video={item} />)}</div> : <div className="rounded-2xl border border-[#e8ebf0] bg-white px-5 py-8 text-sm leading-6 text-[#7d8797]">More videos will appear here as they are uploaded.</div>}</aside>
          </div>
        )}
      </div>
    </main>
  );
}
