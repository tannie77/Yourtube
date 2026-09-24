"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Download, Film, RefreshCw } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";

type DownloadUsage = {
  dayKey: string;
  planId: string;
  limit: number;
  completed: number;
  pending: number;
  remaining: number;
};

type DownloadEntry = {
  id: string;
  videoId: string;
  title: string;
  videoAvailable: boolean;
  thumbnailAvailable: boolean;
  startedAt: string;
  finishedAt: string | null;
  status: "reserved" | "completed" | "failed";
  failureReason: "connection_closed" | "transfer_failed" | "server_restart" | null;
  planId: string;
  quality: string;
  fileSize: number;
  browser: string;
  device: string;
};

const apiBase = axiosInstance.defaults.baseURL || "http://127.0.0.1:5000";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(value));
}

function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
}

function Thumbnail({ entry }: { entry: DownloadEntry }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#e8edf1] dark:bg-[#2b374b] text-[#9aa6af] dark:text-[#aab5c8] sm:w-[192px]">
      {entry.thumbnailAvailable && !failed ? (
        <Image
          src={`${apiBase}/video/downloads/${entry.id}/thumbnail`}
          alt={`Thumbnail for ${entry.title}`}
          width={192}
          height={108}
          unoptimized
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : <Film className="size-8" aria-hidden="true" />}
    </div>
  );
}

function DownloadCard({ entry }: { entry: DownloadEntry }) {
  const statusLabel = entry.status === "completed" ? "Completed" : entry.status === "failed" ? "Failed / interrupted" : "Pending";
  const statusStyle = entry.status === "completed" ? "bg-[#eaf5ee] dark:bg-[#273d3a] text-[#45845a] dark:text-[#91d7ae]" : entry.status === "failed" ? "bg-[#fff0ec] dark:bg-[#43313a] text-[#bd604f] dark:text-[#ff9b87]" : "bg-[#fff6e6] dark:bg-[#43313a] text-[#9d7738] dark:text-[#eac48e]";
  const planLabel = `${entry.planId.charAt(0).toUpperCase()}${entry.planId.slice(1)}`;

  return (
    <article className="flex flex-col gap-4 rounded-[22px] border border-[#e8ebf0] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] p-4 shadow-[0_8px_22px_rgba(24,33,55,0.025)] transition hover:border-[#efc2b8] dark:hover:border-[#73505a] hover:shadow-[0_16px_32px_rgba(24,33,55,0.07)] sm:flex-row sm:items-center sm:p-5">
      <Thumbnail entry={entry} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyle}`}>{statusLabel}</span>
          <span className="text-xs text-[#98a2af] dark:text-[#aab5c8]">{dateLabel(entry.startedAt)} IST</span>
        </div>
        <h3 className="mt-2 line-clamp-2 text-base font-semibold tracking-[-0.025em]">{entry.title}</h3>
        <p className="mt-1 text-xs text-[#748094] dark:text-[#aab5c8]">{entry.quality} · {sizeLabel(entry.fileSize)} · {planLabel} plan</p>
        <p className="mt-1 text-xs text-[#98a2af] dark:text-[#aab5c8]">{entry.browser} on {entry.device}</p>
        {entry.status === "failed" && <p className="mt-2 text-xs text-[#bd604f] dark:text-[#ff9b87]">{entry.failureReason === "server_restart" ? "Local API restarted during this attempt. You can try again." : "Transfer did not finish. You can try again."}</p>}
      </div>
      {entry.videoAvailable && (
        <Link href={`/watch/${entry.videoId}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#d95c44] dark:text-[#ff9b87] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ed6049]">
          View video <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}

export default function DownloadsPage() {
  const [usage, setUsage] = useState<DownloadUsage | null>(null);
  const [entries, setEntries] = useState<DownloadEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([
      axiosInstance.get<DownloadUsage>("/video/downloads/usage/me"),
      axiosInstance.get<DownloadEntry[]>("/video/downloads/me"),
    ]).then(([quota, history]) => {
      if (!active) return;
      setUsage(quota.data);
      setEntries(history.data);
      setError(false);
    }).catch(() => {
      if (!active) return;
      setUsage(null);
      setEntries([]);
      setError(true);
    })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  function refresh() {
    setLoading(true);
    setRevision((current) => current + 1);
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] dark:bg-[#101624] text-[#172033] dark:text-[#e6ecf7]">
      <div className="mx-auto max-w-[1510px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        <section className="relative overflow-hidden rounded-[28px] bg-[#171b30] px-7 py-9 text-white sm:px-10 sm:py-11" style={{ backgroundImage: "radial-gradient(circle at 82% 12%, rgba(237,96,73,.3), transparent 34%), radial-gradient(circle at 48% 110%, rgba(113,88,172,.28), transparent 56%)" }} aria-labelledby="downloads-heading">
          <div className="pointer-events-none absolute -right-16 -top-48 hidden size-[500px] rounded-full border border-white/10 shadow-[0_0_0_54px_rgba(255,255,255,.035),0_0_0_108px_rgba(255,255,255,.02)] lg:block" aria-hidden="true" />
          <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,330px)] lg:items-center">
            <div className="max-w-[630px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#ffe7df]"><span className="size-1.5 rounded-full bg-[#ffa98e]" /> Your offline library</span>
              <h1 id="downloads-heading" className="mt-5 text-[clamp(2.1rem,4vw,3.6rem)] font-semibold leading-[1.08] tracking-[-0.06em]">Your <span className="text-[#ffb29b]">downloads.</span></h1>
              <p className="mt-4 max-w-[510px] text-sm leading-6 text-[#d6dae8] sm:text-[15px] sm:leading-7">Keep track of your MP4 downloads and see how many are left today. Saved files stay in your browser’s download folder.</p>
              {!loading && !error && <span className="mt-7 inline-flex rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-xs font-semibold text-[#e5e7f0]">{entries.length} {entries.length === 1 ? "download record" : "download records"}</span>}
            </div>
            <div className="rounded-[22px] border border-white/15 bg-white/10 p-5 shadow-[0_20px_35px_rgba(10,12,28,.12)] backdrop-blur-sm sm:p-6" aria-label="Today's download allowance">
              <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-white/15 text-[#ffb29b]"><Download className="size-5" aria-hidden="true" /></span><p className="text-sm font-semibold">Today’s allowance</p></div>
              <p className="mt-6 text-5xl font-semibold tracking-[-0.07em]">{loading ? "—" : usage ? usage.remaining : "—"}<span className="ml-2 text-base font-medium tracking-normal text-[#bac3d1]">of {usage?.limit ?? "—"} left</span></p>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#ed745c]" style={{ width: `${usage ? Math.max(0, Math.min(100, (usage.completed / Math.max(1, usage.limit)) * 100)) : 0}%` }} /></div>
              <p className="mt-3 text-xs text-[#bac3d1]">{usage ? `${usage.planId.charAt(0).toUpperCase()}${usage.planId.slice(1)} plan · resets at midnight IST` : error ? "Quota unavailable right now" : "Checking your plan and quota…"}</p>
              {usage && <p className="mt-1 text-xs text-[#bac3d1]">{usage.completed} completed{usage.pending > 0 ? ` · ${usage.pending} pending` : ""}</p>}
            </div>
          </div>
        </section>

        <section className="pb-14 pt-8" aria-labelledby="download-history-heading" aria-live="polite">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e16b55] dark:text-[#ff9b87]">Your records</p><h2 id="download-history-heading" className="mt-1 text-2xl font-semibold tracking-[-0.05em]">Download history</h2><p className="mt-1 text-sm text-[#7d8797] dark:text-[#aab5c8]">Past records stay visible even if your membership changes.</p></div>
            <button type="button" onClick={refresh} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#e5e9ef] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] px-4 text-xs font-semibold text-[#5b6677] dark:text-[#e6ecf7] transition hover:border-[#edb3a7] dark:hover:border-[#73505a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ed6049] disabled:opacity-50"><RefreshCw className="size-4" aria-hidden="true" /> Refresh</button>
          </div>
          {loading ? (
            <div className="mt-6 space-y-3" aria-label="Loading downloads">{[0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-[22px] bg-[#e8ebf0] dark:bg-[#2b374b]" />)}</div>
          ) : error ? (
            <p role="alert" className="mt-5 rounded-2xl bg-white dark:bg-[#202a3d] p-6 text-sm text-[#a34d3d] dark:text-[#ff9b87]">Could not load your downloads. Check the local API and try Refresh.</p>
          ) : entries.length === 0 ? (
            <div className="mt-6 flex flex-col items-center rounded-[28px] border border-[#e8ebf0] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] px-6 py-14 text-center shadow-[0_10px_30px_rgba(24,33,55,0.025)]">
              <span className="flex size-20 items-center justify-center rounded-[24px] bg-[#fff0ec] dark:bg-[#43313a] text-[#e56a51] dark:text-[#ff9b87]"><Download className="size-10" strokeWidth={1.5} aria-hidden="true" /></span>
              <h3 className="mt-7 text-xl font-semibold tracking-[-0.045em]">Your downloads start here</h3>
              <p className="mt-2 max-w-[420px] text-sm leading-6 text-[#7b8494] dark:text-[#aab5c8]">Choose a video in the library and use Download MP4. Your attempts will appear here.</p>
              <Link href="/library" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#dd604b] dark:text-[#ff9b87] hover:text-[#bd4936] dark:hover:text-[#ff9b87]">
                Explore videos <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <div className="mt-6 space-y-3">{entries.map((entry) => <DownloadCard key={entry.id} entry={entry} />)}</div>
          )}
        </section>
      </div>
    </main>
  );
}
