"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Film, Pencil, Sparkles } from "lucide-react";
import ChannelDialogue from "@/components/channeldialgoue";
import LocalVideoCard from "@/components/local-video-card";
import VideoUploader from "@/components/VideoUploader";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContent";
import type { LocalVideo } from "@/lib/local-video";

type LibraryState = "loading" | "ready" | "error";

export default function ChannelPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useUser();
  const [editing, setEditing] = useState(false);
  const [videos, setVideos] = useState<LocalVideo[]>([]);
  const [libraryState, setLibraryState] = useState<LibraryState>("loading");
  const [refreshKey, setRefreshKey] = useState(0);
  const isOwner = Boolean(user && user._id === id && user.channelname);

  useEffect(() => {
    if (!isOwner) return;
    let active = true;
    axiosInstance.get<LocalVideo[]>("/video/getall")
      .then((response) => {
        if (!active) return;
        setVideos(response.data.filter((video) => video.uploader === id));
        setLibraryState("ready");
      })
      .catch(() => { if (active) setLibraryState("error"); });
    return () => { active = false; };
  }, [id, isOwner, refreshKey]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] text-sm text-[#7d8797]">Opening your channel…</main>;
  if (!isOwner) {
    return <main className="min-h-screen bg-[#f7f8fb] text-[#172033]"><div className="mx-auto max-w-3xl px-5 py-20 text-center"><h1 className="text-2xl font-semibold">This channel is not available</h1><p className="mt-2 text-sm text-[#7d8797]">You can manage only your own channel in this local prototype.</p><Link href="/dashboard" className="mt-5 inline-flex text-sm font-semibold text-[#dd604b] hover:underline">Back to dashboard</Link></div></main>;
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#172033] [font-family:'Avenir_Next',Avenir,'Segoe_UI',ui-sans-serif,system-ui,sans-serif]">
      <div className="mx-auto max-w-[1510px] space-y-7 px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        <section className="relative overflow-hidden rounded-[28px] px-7 py-8 text-white sm:px-10 sm:py-10" style={{ background: "radial-gradient(circle at 82% 15%, rgba(239,151,135,.28), transparent 32%), radial-gradient(circle at 55% 110%, rgba(133,103,180,.3), transparent 50%), #171b30" }}>
          <div className="pointer-events-none absolute -right-10 -bottom-28 size-80 rounded-full border border-white/10 shadow-[0_0_0_46px_rgba(255,255,255,.035),0_0_0_96px_rgba(255,255,255,.02)]" aria-hidden="true" />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-[670px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#ffe7df]"><Sparkles className="size-3" aria-hidden="true" /> Your channel</span>
              <div className="mt-5 flex items-center gap-4"><span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#ed6049] text-2xl font-bold shadow-[0_14px_25px_rgba(10,12,28,.2)]">{String(user.channelname).slice(0, 1).toUpperCase()}</span><div className="min-w-0"><h1 className="truncate text-[clamp(1.8rem,3vw,2.8rem)] font-semibold leading-tight tracking-[-0.06em]">{user.channelname}</h1><p className="mt-1 text-sm text-[#c7cada]">Created by {user.name}</p></div></div>
              <p className="mt-5 max-w-[560px] whitespace-pre-wrap text-sm leading-6 text-[#d6dae8]">{user.description || "This is your corner of VidCircle. Add a short description to introduce your videos."}</p>
            </div>
            <button type="button" onClick={() => setEditing(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"><Pencil className="size-4" aria-hidden="true" /> Edit channel</button>
          </div>
        </section>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="order-2 min-w-0 xl:order-1" aria-live="polite">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e16b55]">Your collection</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.05em]">Channel videos</h2><p className="mt-1 text-sm text-[#7d8797]">Everything you upload appears here and in the dashboard library.</p></div>{libraryState === "ready" && <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#7b8494]">{videos.length} {videos.length === 1 ? "video" : "videos"}</span>}</div>
            {libraryState === "loading" && <div className="grid gap-5 sm:grid-cols-2" aria-label="Loading your videos">{[0, 1].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl bg-[#e8ebf0]" />)}</div>}
            {libraryState === "error" && <div className="rounded-2xl border border-[#f3d5cf] bg-[#fff7f4] px-6 py-10 text-center"><p className="font-semibold text-[#7a3b31]">Could not load your videos</p><p className="mt-2 text-sm text-[#a56b60]">Check the local API and try again.</p><button type="button" className="mt-4 text-sm font-semibold text-[#dd604b] hover:underline" onClick={() => { setLibraryState("loading"); setRefreshKey((key) => key + 1); }}>Retry</button></div>}
            {libraryState === "ready" && videos.length === 0 && <div className="flex min-h-64 flex-col items-center justify-center rounded-[24px] border border-[#e8ebf0] bg-white px-6 py-10 text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-[#fff0ec] text-[#e56a51]"><Film className="size-7" aria-hidden="true" /></span><h3 className="mt-5 text-lg font-semibold tracking-[-0.04em]">Your first video starts here</h3><p className="mt-2 max-w-xs text-sm leading-6 text-[#7d8797]">Choose an MP4 in the upload panel, give it a title, and it will appear here.</p><a href="#upload-video" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#dd604b] hover:underline">Go to upload <ArrowRight className="size-4" aria-hidden="true" /></a></div>}
            {libraryState === "ready" && videos.length > 0 && <div className="grid gap-5 sm:grid-cols-2">{videos.map((video) => <LocalVideoCard key={video._id} video={video} />)}</div>}
          </section>

          <section id="upload-video" className="order-1 scroll-mt-24 rounded-[24px] border border-[#e8ebf0] bg-white p-5 shadow-[0_10px_30px_rgba(24,33,55,0.025)] sm:p-6 xl:order-2">
            <VideoUploader channelName={user.channelname} onUploaded={(video) => { setVideos((current) => [video, ...current]); setLibraryState("ready"); }} />
          </section>
        </div>
      </div>
      <ChannelDialogue isopen={editing} onclose={() => setEditing(false)} mode="edit" channeldata={{ name: user.channelname, description: user.description }} />
    </main>
  );
}
