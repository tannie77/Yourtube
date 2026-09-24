"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clapperboard, Film, Play, Search } from "lucide-react";
import ChannelDialogue from "@/components/channeldialgoue";
import LocalVideoCard from "@/components/local-video-card";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContent";
import type { LocalVideo } from "@/lib/local-video";

type LibraryState = "loading" | "ready" | "error";

export default function LibraryPage() {
  const { user } = useUser();
  const [videos, setVideos] = useState<LocalVideo[]>([]);
  const [libraryState, setLibraryState] = useState<LibraryState>("loading");
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [channelOpen, setChannelOpen] = useState(false);

  useEffect(() => {
    let active = true;
    axiosInstance.get("/video/getall")
      .then((response) => {
        if (!active) return;
        const result = Array.isArray(response.data) ? response.data : response.data?.videos;
        setVideos(Array.isArray(result) ? result : []);
        setLibraryState("ready");
      })
      .catch(() => { if (active) setLibraryState("error"); });
    return () => { active = false; };
  }, [refreshKey]);

  const matchingVideos = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return videos;
    return videos.filter((video) =>
      `${video.videotitle} ${video.videochanel}`.toLowerCase().includes(query),
    );
  }, [searchQuery, videos]);

  return (
    <main className="min-h-screen bg-[#f7f8fb] dark:bg-[#101624] text-[#172033] dark:text-[#e6ecf7]">
      <div className="mx-auto max-w-[1510px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        <section className="relative overflow-hidden rounded-[28px] bg-[#171b30] px-7 py-9 text-white sm:px-10 sm:py-11" style={{ backgroundImage: "radial-gradient(circle at 82% 10%, rgba(235,123,115,.24), transparent 33%), radial-gradient(circle at 54% 120%, rgba(113,88,172,.3), transparent 55%)" }}>
          <div className="pointer-events-none absolute -right-16 -top-48 hidden size-[500px] rounded-full border border-white/10 shadow-[0_0_0_54px_rgba(255,255,255,.035),0_0_0_108px_rgba(255,255,255,.02)] lg:block" aria-hidden="true" />
          <div className="pointer-events-none absolute right-[12%] top-1/2 hidden size-28 -translate-y-1/2 items-center justify-center rounded-[32px] border border-white/20 bg-white/10 text-[#ffb29b] shadow-[0_20px_50px_rgba(10,12,28,.25)] backdrop-blur-sm lg:flex" aria-hidden="true"><Play className="ml-1 size-11 fill-current" strokeWidth={1.5} /></div>
          <div className="relative z-10 max-w-[620px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#ffe7df]"><span className="size-1.5 rounded-full bg-[#ffa98e]" /> Explore VidCircle</span>
            <h1 className="mt-5 text-[clamp(2.1rem,4vw,3.6rem)] font-semibold leading-[1.08] tracking-[-0.06em]">The video <span className="text-[#ffb29b]">library.</span></h1>
            <p className="mt-4 max-w-[490px] text-sm leading-6 text-[#d6dae8] sm:text-[15px] sm:leading-7">A home for every story shared on VidCircle. Search by title or channel and find your next watch.</p>
            <label className="mt-7 flex h-12 w-full max-w-[520px] items-center gap-3 rounded-xl bg-white px-4 text-[#929aaa] shadow-[0_12px_28px_rgba(10,12,28,.18)] focus-within:ring-4 focus-within:ring-[#ed6049]/35" htmlFor="library-search">
              <Search className="size-[18px] shrink-0" aria-hidden="true" />
              <input id="library-search" type="search" aria-label="Search local videos" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search videos or channels" className="min-w-0 flex-1 bg-transparent text-sm text-[#172033] outline-none placeholder:text-[#a0a8b5]" />
            </label>
          </div>
        </section>

        <section className="pb-14 pt-8" aria-labelledby="all-videos-heading" aria-live="polite">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e16b55] dark:text-[#ff9b87]">Watch and discover</p>
              <h2 id="all-videos-heading" className="mt-1 text-2xl font-semibold tracking-[-0.05em]">All videos</h2>
            </div>
            {libraryState === "ready" && videos.length > 0 && <span className="rounded-full bg-white dark:bg-[#202a3d] px-3 py-1.5 text-xs font-semibold text-[#7b8494] dark:text-[#aab5c8]">{matchingVideos.length} {matchingVideos.length === 1 ? "video" : "videos"}</span>}
          </div>

          {libraryState === "loading" && <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading videos">{[0, 1, 2].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl bg-[#e8ebf0] dark:bg-[#2b374b]" />)}</div>}

          {libraryState === "error" && <div className="rounded-3xl border border-[#f3d5cf] dark:border-[#73505a] bg-[#fff7f4] dark:bg-[#43313a] px-6 py-12 text-center"><h3 className="text-lg font-semibold text-[#7a3b31] dark:text-[#ff9b87]">Could not load the local library</h3><p className="mt-2 text-sm text-[#a56b60] dark:text-[#ff9b87]">Check that the local API is running, then try again.</p><button type="button" className="mt-5 rounded-xl bg-[#ed6049] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#dc523c]" onClick={() => { setLibraryState("loading"); setRefreshKey((value) => value + 1); }}>Retry</button></div>}

          {libraryState === "ready" && videos.length === 0 && (
            <div className="flex flex-col items-center rounded-[28px] border border-[#e8ebf0] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] px-6 py-12 text-center shadow-[0_10px_30px_rgba(24,33,55,0.025)] sm:py-14">
              <span className="flex size-20 items-center justify-center rounded-[24px] bg-[#fff0ec] dark:bg-[#43313a] text-[#e56a51] dark:text-[#ff9b87]"><Clapperboard className="size-10" strokeWidth={1.5} aria-hidden="true" /></span>
              <h3 className="mt-7 text-xl font-semibold tracking-[-0.045em]">Your video library starts here</h3>
              <p className="mt-2 max-w-[420px] text-sm leading-6 text-[#7b8494] dark:text-[#aab5c8]">No videos have been added to this local workspace yet. Upload an MP4 to start your library.</p>
              {user?.channelname ? <Link href={`/channel/${user._id}`} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#dd604b] dark:text-[#ff9b87] hover:text-[#bd4936] dark:hover:text-[#ff9b87]">Upload your first video <ArrowRight className="size-4" aria-hidden="true" /></Link> : <button type="button" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#dd604b] dark:text-[#ff9b87] hover:text-[#bd4936] dark:hover:text-[#ff9b87]" onClick={() => setChannelOpen(true)}>Create your channel <ArrowRight className="size-4" aria-hidden="true" /></button>}
            </div>
          )}

          {libraryState === "ready" && videos.length > 0 && matchingVideos.length === 0 && <div className="rounded-3xl border border-[#e8ebf0] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] px-6 py-14 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#f3f5f8] dark:bg-[#263149] text-[#8490a1] dark:text-[#aab5c8]"><Film className="size-7" aria-hidden="true" /></span><h3 className="mt-5 text-lg font-semibold">No matching videos</h3><p className="mt-2 text-sm text-[#7b8494] dark:text-[#aab5c8]">Try another title or channel name.</p><button type="button" className="mt-4 text-sm font-semibold text-[#dd604b] dark:text-[#ff9b87] hover:underline" onClick={() => setSearchQuery("")}>Clear search</button></div>}

          {libraryState === "ready" && matchingVideos.length > 0 && <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{matchingVideos.map((video) => <LocalVideoCard key={video._id} video={video} />)}</div>}
        </section>
      </div>
      <ChannelDialogue isopen={channelOpen} onclose={() => setChannelOpen(false)} mode="create" />
    </main>
  );
}
