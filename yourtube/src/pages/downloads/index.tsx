"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Download, Film, RefreshCw } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import { listOfflineVideos, removeOfflineVideo, type OfflineVideo } from "@/lib/offline-library";
import type { SubscriptionSnapshot } from "@/lib/subscriptions";

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

type DownloadUsage = {
  planId: string;
  limit: number;
  dailyRemaining: number;
  monthlyLimit: number;
  monthlyRemaining: number;
};

const apiBase = axiosInstance.defaults.baseURL || (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:5000");

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
    <div className="relative flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--yt-soft)] text-[var(--yt-muted)] sm:w-[192px]">
      {entry.thumbnailAvailable && !failed ? (
        <img
          src={`${apiBase}/video/downloads/${entry.id}/thumbnail`}
          crossOrigin="use-credentials"
          alt={`Thumbnail for ${entry.title}`}
          width={192}
          height={108}
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
    <article className="flex flex-col gap-4 yt-downloads-surface yt-downloads-card transition hover:shadow-[var(--yt-shadow)] sm:flex-row sm:items-start">
      <Thumbnail entry={entry} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyle}`}>{statusLabel}</span>
          <span className="text-xs text-[var(--yt-muted)]">{dateLabel(entry.startedAt)} IST</span>
        </div>
        <h3 className="mt-2 line-clamp-2 text-base font-semibold tracking-[-0.025em]">{entry.title}</h3>
        <p className="mt-1 text-xs text-[var(--yt-muted)]">{entry.quality} · {sizeLabel(entry.fileSize)} · {planLabel} plan</p>
        <p className="mt-1 text-xs text-[var(--yt-muted)]">{entry.browser} on {entry.device}</p>
        {entry.status === "failed" && <p className="mt-2 text-xs text-[#bd604f] dark:text-[#ff9b87]">{entry.failureReason === "server_restart" ? "Local API restarted during this attempt. You can try again." : "Transfer did not finish. You can try again."}</p>}
      </div>
      {entry.videoAvailable && (
        <Link href={`/watch/${entry.videoId}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--yt-red)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--yt-red)] sm:self-center">
          View video <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}

export default function DownloadsPage() {
  const { user } = useUser();
  const [entries, setEntries] = useState<DownloadEntry[]>([]);
  const [offlineItems, setOfflineItems] = useState<OfflineVideo[]>([]);
  const [offlineUrl, setOfflineUrl] = useState("");
  const [playingKey, setPlayingKey] = useState("");
  const [membership, setMembership] = useState<SubscriptionSnapshot | null>(null);
  const [usage, setUsage] = useState<DownloadUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!user?._id) { setOfflineItems([]); return; }
    void listOfflineVideos(user._id).then(setOfflineItems).catch(() => setOfflineItems([]));
    void axiosInstance.get<SubscriptionSnapshot>("/subscriptions/me").then(({ data }) => setMembership(data)).catch(() => setMembership(null));
  }, [user?._id, revision]);

  useEffect(() => () => { if (offlineUrl) URL.revokeObjectURL(offlineUrl); }, [offlineUrl]);

  function playOffline(item: OfflineVideo) {
    if (membership?.status !== "active" || membership.effectivePlanId === "free" || Date.now() >= new Date(item.accessEndsAt).getTime()) return;
    setOfflineUrl(URL.createObjectURL(item.blob));
    setPlayingKey(item.key);
  }

  async function removeOffline(item: OfflineVideo) {
    await removeOfflineVideo(item.key);
    setOfflineItems((current) => current.filter((entry) => entry.key !== item.key));
    if (playingKey === item.key) { setPlayingKey(""); setOfflineUrl(""); }
  }

  useEffect(() => {
    let active = true;
    void axiosInstance.get<DownloadUsage>("/video/downloads/usage/me")
      .then(({ data }) => { if (active) setUsage(data); })
      .catch(() => { if (active) setUsage(null); });
    void axiosInstance.get<DownloadEntry[]>("/video/downloads/me").then(({ data }) => {
      if (!active) return;
      setEntries(data);
      setError(false);
    }).catch(() => {
      if (!active) return;
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
    <main className="yt-page yt-downloads-page">
      <div>
        <section className="yt-downloads-hero" aria-labelledby="downloads-heading">
          <div className="pointer-events-none absolute -right-16 -top-48 hidden size-[500px] rounded-full border border-white/10 shadow-[0_0_0_54px_rgba(255,255,255,.035),0_0_0_108px_rgba(255,255,255,.02)] lg:block" aria-hidden="true" />
          <div className="relative z-10">
            <div className="max-w-[630px]">
              <h1 id="downloads-heading" className="yt-downloads-hero-title">Your <span className="text-[#ff9caa]">downloads.</span></h1>
              <p className="yt-downloads-hero-copy max-w-[510px]">Keep track of your MP4 downloads. Saved files stay in your browser’s download folder.</p>
              {!loading && !error && <span className="mt-7 inline-flex rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-xs font-semibold text-[#e5e7f0]">{entries.length} {entries.length === 1 ? "download record" : "download records"}</span>}
              {usage && <p className="mt-3 text-xs text-[#e5e7f0]">{usage.dailyRemaining} of {usage.limit} downloads remaining today · {usage.monthlyRemaining} of {usage.monthlyLimit} this month · {usage.planId} plan · resets on IST boundaries</p>}
            </div>
          </div>
        </section>

        <section className="pt-8" aria-labelledby="download-history-heading" aria-live="polite">
          <div className="mb-8"><h2 className="text-2xl font-semibold tracking-[-0.05em]">Offline library</h2><p className="mt-1 text-sm yt-subtle">Paid members can save videos in this browser. Copies stay on this device until you remove them; playback follows your membership term.</p>
            {offlineItems.length === 0 ? <p className="mt-4 text-sm yt-subtle">No videos saved in this browser yet.</p> : <div className="mt-4 space-y-3">{offlineItems.map((item) => <div key={item.key} className="yt-downloads-surface yt-downloads-card flex flex-wrap items-center gap-3"><span className="min-w-0 flex-1"><strong className="block truncate">{item.title}</strong><small className="yt-subtle">{item.quality} · saved {dateLabel(item.savedAt)}</small></span><button type="button" className="yt-pill-button" onClick={() => playOffline(item)} disabled={membership?.status !== "active" || membership.effectivePlanId === "free" || Date.now() >= new Date(item.accessEndsAt).getTime()}>Play offline</button><button type="button" className="yt-pill-button" onClick={() => void removeOffline(item)}>Remove</button></div>)}</div>}
            {offlineUrl && <video key={playingKey} controls playsInline src={offlineUrl} className="mt-4 w-full max-w-[760px] rounded-xl bg-black" />}
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><h2 id="download-history-heading" className="text-2xl font-semibold tracking-[-0.05em]">Download history</h2><p className="mt-1 text-sm yt-subtle">Past records stay visible even if your membership changes.</p></div>
            <button type="button" onClick={refresh} disabled={loading} className="yt-downloads-refresh"><RefreshCw className="size-4" aria-hidden="true" /> Refresh</button>
          </div>
          {loading ? (
            <div className="mt-6 space-y-3" aria-label="Loading downloads">{[0, 1, 2].map((item) => <div key={item} className="yt-skeleton h-36" />)}</div>
          ) : error ? (
            <p role="alert" className="mt-5 yt-downloads-surface yt-downloads-card text-sm text-[var(--yt-red)]">Could not load your downloads. Check the local API and try Refresh.</p>
          ) : entries.length === 0 ? (
            <div className="mt-6 yt-downloads-surface yt-downloads-empty">
              <span className="flex size-20 items-center justify-center rounded-[24px] bg-[var(--yt-soft)] text-[var(--yt-red)]"><Download className="size-10" strokeWidth={1.5} aria-hidden="true" /></span>
              <h3 className="mt-7 text-xl font-semibold tracking-[-0.045em]">Your downloads start here</h3>
              <p className="mt-2 max-w-[420px] text-sm leading-6 yt-subtle">Choose a video and use Download MP4. Your attempts will appear here.</p>
              <Link href="/" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--yt-red)] hover:underline">
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
