"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Clock3, History, LockKeyhole, Play } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { accessPlanName, previewSource, type LocalVideo } from "@/lib/local-video";

type Entry = { viewedOn: string; video: LocalVideo };

function watchedDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(value));
}

function HistoryThumbnail({ video }: { video: LocalVideo }) {
  const [failed, setFailed] = useState(false);
  const preview = video.canWatch && video.previewCount && !failed ? previewSource(video, 0) : "";

  return (
    <div className="relative flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_70%_25%,#efb69f,transparent_35%),linear-gradient(135deg,#514d81,#bd7891_58%,#e39a78)] sm:w-[192px]">
      {preview && <Image src={preview} alt={`Preview of ${video.videotitle}`} width={192} height={108} unoptimized className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} />}
      <span className="relative flex size-11 items-center justify-center rounded-full border border-white/70 bg-[#172033]/30 text-white backdrop-blur-sm">
        {video.canWatch ? <Play className="ml-0.5 size-5 fill-current" aria-hidden="true" /> : <LockKeyhole className="size-5" aria-hidden="true" />}
      </span>
    </div>
  );
}

function HistoryCard({ entry }: { entry: Entry }) {
  const { video, viewedOn } = entry;
  const accessLabel = video.mediaUnavailable ? "Video unavailable" : video.canWatch ? "Ready to watch" : `${accessPlanName(video.accessPlan)} plan needed`;
  return (
    <Link href={`/watch/${video._id}`} className="group flex flex-col gap-4 rounded-[22px] border border-[#e8ebf0] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] p-4 shadow-[0_8px_22px_rgba(24,33,55,0.025)] transition hover:-translate-y-0.5 hover:border-[#efc2b8] dark:hover:border-[#73505a] hover:shadow-[0_16px_32px_rgba(24,33,55,0.07)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ed6049] sm:flex-row sm:items-center sm:p-5">
      <HistoryThumbnail video={video} />
      <div className="min-w-0 flex-1">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${video.canWatch ? "bg-[#eaf5ee] dark:bg-[#273d3a] text-[#45845a] dark:text-[#91d7ae]" : "bg-[#fff1ec] dark:bg-[#43313a] text-[#c46a52] dark:text-[#ff9b87]"}`}>
          {accessLabel}
        </span>
        <h3 className="mt-3 line-clamp-2 text-base font-semibold tracking-[-0.025em] text-[#172033] dark:text-[#e6ecf7] group-hover:text-[#d95c44]">{video.videotitle}</h3>
        <p className="mt-1 text-sm text-[#748094] dark:text-[#aab5c8]">{video.videochanel}</p>
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#98a2af] dark:text-[#aab5c8]"><Clock3 className="size-3.5" aria-hidden="true" /> Watched {watchedDate(viewedOn)} IST</p>
      </div>
      <ArrowUpRight className="hidden size-5 shrink-0 text-[#a0a9b6] dark:text-[#aab5c8] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#d95c44] sm:block" aria-hidden="true" />
    </Link>
  );
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void axiosInstance.get<Entry[]>("/video/history/me")
      .then((response) => {
        if (!active) return;
        setEntries(response.data);
        setError(false);
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  function retry() {
    setLoading(true);
    setRevision((current) => current + 1);
  }

  const available = entries.filter((entry) => entry.video.canWatch).length;

  return (
    <main className="min-h-screen bg-[#f7f8fb] dark:bg-[#101624] text-[#172033] dark:text-[#e6ecf7]">
      <div className="mx-auto max-w-[1510px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        <section className="relative overflow-hidden rounded-[28px] bg-[#171b30] px-7 py-9 text-white sm:px-10 sm:py-11" style={{ backgroundImage: "radial-gradient(circle at 80% 16%, rgba(237,96,73,.28), transparent 34%), radial-gradient(circle at 50% 110%, rgba(113,88,172,.28), transparent 56%)" }}>
          <div className="pointer-events-none absolute -right-12 -top-44 hidden size-[480px] rounded-full border border-white/10 shadow-[0_0_0_55px_rgba(255,255,255,.035),0_0_0_110px_rgba(255,255,255,.02)] lg:block" aria-hidden="true" />
          <History className="pointer-events-none absolute right-[13%] top-1/2 hidden size-28 -translate-y-1/2 text-white/10 lg:block" strokeWidth={1} aria-hidden="true" />
          <div className="relative z-10 max-w-[620px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#ffe7df]"><span className="size-1.5 rounded-full bg-[#ffa98e]" /> Your activity</span>
            <h1 className="mt-5 text-[clamp(2.1rem,4vw,3.6rem)] font-semibold leading-[1.08] tracking-[-0.06em]">Watch <span className="text-[#ffb29b]">history.</span></h1>
            <p className="mt-4 max-w-[500px] text-sm leading-6 text-[#d6dae8] sm:text-[15px] sm:leading-7">The stories you have visited, all in one place. Pick up a video or revisit a favourite whenever you like.</p>
            {!loading && !error && <div className="mt-7 flex flex-wrap gap-3 text-xs font-semibold text-[#e5e7f0]"><span className="rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5">{entries.length} {entries.length === 1 ? "video" : "videos"} watched</span><span className="rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5">{available} available now</span></div>}
          </div>
        </section>

        <section className="pb-14 pt-8" aria-labelledby="recently-watched-heading" aria-live="polite">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e16b55] dark:text-[#ff9b87]">Continue watching</p>
          <h2 id="recently-watched-heading" className="mt-1 text-2xl font-semibold tracking-[-0.05em]">Recently watched</h2>
          <p className="mt-1 text-sm text-[#7d8797] dark:text-[#aab5c8]">Your viewing record stays here even when a membership expires.</p>

          {loading ? (
            <div className="mt-6 space-y-3" aria-label="Loading watch history">{[0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-[22px] bg-[#e8ebf0] dark:bg-[#2b374b]" />)}</div>
          ) : error ? (
            <div className="mt-6 rounded-[24px] border border-[#f3d5cf] dark:border-[#73505a] bg-[#fff7f4] dark:bg-[#43313a] px-6 py-12 text-center"><h3 className="text-lg font-semibold text-[#7a3b31] dark:text-[#ff9b87]">Could not load watch history</h3><p className="mt-2 text-sm text-[#a56b60] dark:text-[#ff9b87]">Check that the local API is running, then try again.</p><button type="button" onClick={retry} className="mt-5 rounded-xl bg-[#ed6049] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#dc523c]">Retry</button></div>
          ) : entries.length === 0 ? (
            <div className="mt-6 flex flex-col items-center rounded-[28px] border border-[#e8ebf0] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] px-6 py-14 text-center shadow-[0_10px_30px_rgba(24,33,55,0.025)]"><span className="flex size-20 items-center justify-center rounded-[24px] bg-[#fff0ec] dark:bg-[#43313a] text-[#e56a51] dark:text-[#ff9b87]"><History className="size-10" strokeWidth={1.5} aria-hidden="true" /></span><h3 className="mt-7 text-xl font-semibold tracking-[-0.045em]">Your watch history starts here</h3><p className="mt-2 max-w-[420px] text-sm leading-6 text-[#7b8494] dark:text-[#aab5c8]">Explore the library and open a video. Your recent watches will appear on this page.</p><Link href="/library" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#dd604b] dark:text-[#ff9b87] hover:text-[#bd4936] dark:hover:text-[#ff9b87]">Explore videos <ArrowRight className="size-4" aria-hidden="true" /></Link></div>
          ) : (
            <div className="mt-6 space-y-3">{entries.map((entry) => <HistoryCard key={entry.video._id} entry={entry} />)}</div>
          )}
        </section>
      </div>
    </main>
  );
}
