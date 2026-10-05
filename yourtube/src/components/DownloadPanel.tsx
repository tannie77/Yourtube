"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AxiosError } from "axios";
import { Download, ShieldCheck } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import { saveOfflineVideo } from "@/lib/offline-library";
import type { SubscriptionSnapshot } from "@/lib/subscriptions";
import type { VideoRecord } from "@/lib/video-media";

type DownloadUsage = {
  dayKey: string;
  planId: string;
  limit: number;
  dailyRemaining: number;
  monthlyLimit: number;
  monthlyRemaining: number;
  completed: number;
  pending: number;
  remaining: number;
};

async function downloadError(error: unknown) {
  if (error instanceof AxiosError) {
    const data = error.response?.data;
    try {
      const details = data instanceof Blob ? JSON.parse(await data.text()) : data;
      if (typeof details?.message === "string") return details.message;
    } catch {}
  }
  return "Could not download this video. Check the local API and try again.";
}

export default function DownloadPanel({ video }: { video: VideoRecord }) {
  const { user } = useUser();
  const [usage, setUsage] = useState<DownloadUsage | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([axiosInstance.get<DownloadUsage>("/video/downloads/usage/me"), axiosInstance.get<SubscriptionSnapshot>("/subscriptions/me")])
      .then(([usageResponse, membershipResponse]) => { if (active) { setUsage(usageResponse.data); setSubscription(membershipResponse.data); } })
      .catch(() => { if (active) setError("Could not load your download quotas."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [video._id]);

  async function startDownload(saveOffline = false) {
    if (saveOffline && (!user?._id || !subscription || subscription.status !== "active" || subscription.effectivePlanId === "free" || !subscription.accessEndsAt)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await axiosInstance.get<Blob>(`/video/${video._id}/download`, { responseType: "blob" });
      const quality = video.qualityOptions?.filter((item) => item.allowed).at(-1)?.quality || video.sourceQuality || "video";
      const safeTitle = video.videotitle.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 80) || "yourtube-video";
      if (saveOffline) {
        await saveOfflineVideo({ key: `${user._id}:${video._id}`, userId: user._id, videoId: video._id,
          title: video.videotitle, quality, savedAt: new Date().toISOString(), accessEndsAt: subscription!.accessEndsAt!, blob: response.data });
        setNotice("Saved in this browser's offline library. Open Downloads to play it.");
      } else {
      const objectUrl = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${safeTitle}-${quality}.mp4`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      setNotice("Your browser received the video file. Keep the downloaded copy in a safe place.");
      }
    } catch (failure) {
      setError(await downloadError(failure));
    } finally {
      try {
        const response = await axiosInstance.get<DownloadUsage>("/video/downloads/usage/me");
        setUsage(response.data);
      } catch {}
      setBusy(false);
    }
  }

  return <section className="yt-downloads-surface yt-downloads-card mt-6 flex flex-wrap items-center justify-between gap-4" aria-label="Download this video">
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--yt-soft)] text-[var(--yt-red)]"><Download className="size-5" aria-hidden="true" /></span>
      <div><h2 className="text-sm font-semibold text-[var(--yt-text)]">Download for offline viewing</h2><p className="mt-1 text-xs text-[var(--yt-muted)]">{loading ? "Checking download quotas…" : usage ? `${usage.dailyRemaining} of ${usage.limit} left today · ${usage.monthlyRemaining} of ${usage.monthlyLimit} left this month (IST)` : "Your quotas will be checked before download."}</p><p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--yt-muted)]"><ShieldCheck className="size-3" aria-hidden="true" /> Your plan and this video are checked on every request.</p><Link href="/downloads" className="mt-2 inline-block text-xs font-semibold text-[var(--yt-red)] hover:underline">View download history</Link></div>
    </div>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void startDownload()} disabled={busy || loading || usage?.remaining === 0} className="yt-primary-button"><Download className="size-4" aria-hidden="true" /> {busy ? "Preparing file…" : usage?.monthlyRemaining === 0 ? "Monthly quota used" : usage?.remaining === 0 ? "Quota used today" : "Download MP4"}</button>
      {subscription?.status === "active" && subscription.effectivePlanId !== "free" && <button type="button" onClick={() => void startDownload(true)} disabled={busy || loading || usage?.remaining === 0} className="yt-pill-button">Save offline</button>}
    </div>
    {(error || notice) && <p role={error ? "alert" : "status"} className={`w-full text-xs ${error ? "text-[var(--yt-red)]" : "text-[#33805a] dark:text-[#91d7ae]"}`}>{error || notice}</p>}
  </section>;
}
