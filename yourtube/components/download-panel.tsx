"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AxiosError } from "axios";
import { Download, ShieldCheck } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import type { LocalVideo } from "@/lib/local-video";

type DownloadUsage = {
  dayKey: string;
  planId: string;
  limit: number;
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
    } catch { /* Keep the local API fallback below. */ }
  }
  return "Could not download this video. Check the local API and try again.";
}

export default function DownloadPanel({ video }: { video: LocalVideo }) {
  const [usage, setUsage] = useState<DownloadUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void axiosInstance.get<DownloadUsage>("/video/downloads/usage/me")
      .then((response) => { if (active) setUsage(response.data); })
      .catch(() => { if (active) setError("Could not load today's download quota."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [video._id]);

  async function startDownload() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await axiosInstance.get<Blob>(`/video/${video._id}/download`, { responseType: "blob" });
      const quality = video.qualityOptions?.filter((item) => item.allowed).at(-1)?.quality || video.sourceQuality || "video";
      const safeTitle = video.videotitle.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 80) || "vidcircle-video";
      const objectUrl = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${safeTitle}-${quality}.mp4`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      setNotice("Your browser received the video file. Keep the downloaded copy in a safe place.");
    } catch (failure) {
      setError(await downloadError(failure));
    } finally {
      try {
        const response = await axiosInstance.get<DownloadUsage>("/video/downloads/usage/me");
        setUsage(response.data);
      } catch { /* The server still enforces the quota. */ }
      setBusy(false);
    }
  }

  return <section className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-[#e8ebf0] bg-white p-5 sm:p-6" aria-label="Download this video">
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#eaf5ee] text-[#518b64]"><Download className="size-5" aria-hidden="true" /></span>
      <div><h2 className="text-sm font-semibold text-[#344054]">Download for offline viewing</h2><p className="mt-1 text-xs text-[#7d8797]">{loading ? "Checking today's quota…" : usage ? `${usage.remaining} of ${usage.limit} downloads remaining today · resets at midnight IST` : "Your quota will be checked before download."}</p><p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#929bab]"><ShieldCheck className="size-3" aria-hidden="true" /> Your plan and this video are checked on every request.</p><Link href="/downloads" className="mt-2 inline-block text-xs font-semibold text-[#d95c44] hover:underline">View download history</Link></div>
    </div>
    <button type="button" onClick={() => void startDownload()} disabled={busy || loading || usage?.remaining === 0} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ed6049] px-4 text-xs font-semibold text-white transition hover:bg-[#d9543e] disabled:cursor-not-allowed disabled:opacity-50"><Download className="size-4" aria-hidden="true" /> {busy ? "Preparing file…" : usage?.remaining === 0 ? "Quota used today" : "Download MP4"}</button>
    {(error || notice) && <p role={error ? "alert" : "status"} className={`w-full text-xs ${error ? "text-[#a65348]" : "text-[#518b64]"}`}>{error || notice}</p>}
  </section>;
}
