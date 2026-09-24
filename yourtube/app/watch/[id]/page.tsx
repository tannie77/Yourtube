"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Film, UserRound } from "lucide-react";
import LocalVideoCard from "@/components/local-video-card";
import Videoplayer from "@/components/Videoplayer";
import WorkspaceTopbar from "@/components/workspace-topbar";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContent";
import { addedDate, type LocalVideo } from "@/lib/local-video";

type VideoState = "loading" | "ready" | "error";

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const [video, setVideo] = useState<LocalVideo | null>(null);
  const [related, setRelated] = useState<LocalVideo[]>([]);
  const [state, setState] = useState<VideoState>("loading");
  const [refreshKey, setRefreshKey] = useState(0);

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
    return () => { active = false; };
  }, [id, refreshKey]);

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#172033] [font-family:'Avenir_Next',Avenir,'Segoe_UI',ui-sans-serif,system-ui,sans-serif]">
      <WorkspaceTopbar section="Watch" />
      <div className="mx-auto max-w-[1510px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        <Link href="/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[#687486] transition hover:text-[#ed6049]"><ArrowLeft className="size-4" aria-hidden="true" /> Back to library</Link>

        {state === "loading" && <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_310px]" aria-label="Loading video"><div className="aspect-video animate-pulse rounded-[22px] bg-[#e8ebf0]" /><div className="h-64 animate-pulse rounded-2xl bg-[#e8ebf0]" /></div>}
        {state === "error" && <div className="rounded-[24px] border border-[#f3d5cf] bg-[#fff7f4] px-6 py-16 text-center"><h1 className="text-xl font-semibold text-[#7a3b31]">Could not load this video</h1><p className="mt-2 text-sm text-[#a56b60]">Check that the local API is running, then try again.</p><button type="button" className="mt-5 rounded-xl bg-[#ed6049] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#dc523c]" onClick={() => { setState("loading"); setRefreshKey((key) => key + 1); }}>Retry</button></div>}
        {state === "ready" && !video && <div className="rounded-[24px] border border-[#e8ebf0] bg-white px-6 py-16 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#fff0ec] text-[#e56a51]"><Film className="size-7" aria-hidden="true" /></span><h1 className="mt-5 text-xl font-semibold">Video not found</h1><p className="mt-2 text-sm text-[#7d8797]">This video is no longer in the local library.</p><Link href="/dashboard" className="mt-5 inline-flex text-sm font-semibold text-[#dd604b] hover:underline">Browse the library</Link></div>}

        {state === "ready" && video && (
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_310px]">
            <div className="min-w-0 space-y-6">
              <Videoplayer key={video._id} video={video} />
              <section className="rounded-[22px] border border-[#e8ebf0] bg-white p-6 sm:p-7">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e16b55]">Now watching · Local MP4</p>
                <h1 className="mt-2 text-[clamp(1.5rem,2.5vw,2.1rem)] font-semibold leading-tight tracking-[-0.05em]">{video.videotitle}</h1>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[#edf0f4] pt-5">
                  <div className="flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f5f2ff] text-[#7562a8]"><UserRound className="size-5" aria-hidden="true" /></span><div><p className="text-sm font-semibold text-[#344054]">{video.videochanel}</p><p className="text-xs text-[#929bab]">{addedDate(video.createdAt)}</p></div></div>
                  {user?._id === video.uploader && <Link href={`/channel/${user._id}`} className="text-sm font-semibold text-[#dd604b] hover:underline">Manage your channel</Link>}
                </div>
              </section>
              <p className="px-1 text-xs leading-5 text-[#929bab]">This is the basic local player. Custom controls, watch progress and captions belong to a later build.</p>
            </div>
            <aside className="min-w-0"><h2 className="mb-4 text-lg font-semibold tracking-[-0.04em]">More from the library</h2>{related.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">{related.map((item) => <LocalVideoCard key={item._id} video={item} />)}</div> : <div className="rounded-2xl border border-[#e8ebf0] bg-white px-5 py-8 text-sm leading-6 text-[#7d8797]">More videos will appear here as they are uploaded.</div>}</aside>
          </div>
        )}
      </div>
    </main>
  );
}
