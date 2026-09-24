"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AxiosError } from "axios";
import { Check, Flag, ShieldCheck, Trash2 } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContent";

type Report = {
  _id: string;
  reason: "spam" | "harassment" | "offensive";
  reportedText: string;
  reportedRevision: number;
  createdAt: string;
  reporter: { name: string; username: string | null };
  comment: { _id: string; text: string | null; deletedAt: string | null; videoId: string; author: string; revision: number } | null;
};
type ModerationLog = { _id: string; commentId: string; decision: "dismiss" | "remove"; reason: string; admin: string; createdAt: string };

function message(error: unknown) {
  if (error instanceof AxiosError && typeof error.response?.data?.message === "string") return error.response.data.message;
  return "Could not load moderation data. Check the local API.";
}

export default function ModerationPage() {
  const { user } = useUser();
  const [reports, setReports] = useState<Report[]>([]);
  const [logs, setLogs] = useState<ModerationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await axiosInstance.get<{ reports: Report[]; logs: ModerationLog[] }>("/comment/moderation/queue");
      setReports(response.data.reports);
      setLogs(response.data.logs);
      setError("");
    } catch (failure) {
      setError(message(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role !== "admin") return;
    let active = true;
    void axiosInstance.get<{ reports: Report[]; logs: ModerationLog[] }>("/comment/moderation/queue")
      .then((response) => {
        if (!active) return;
        setReports(response.data.reports);
        setLogs(response.data.logs);
      })
      .catch((failure) => { if (active) setError(message(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.role]);

  async function review(report: Report, decision: "dismiss" | "remove") {
    if (decision === "remove" && !window.confirm("Remove this comment for everyone? Replies will stay visible.")) return;
    setBusyId(report._id);
    setError("");
    try {
      await axiosInstance.post(`/comment/moderation/${report._id}`, { decision });
      await load();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusyId(null);
    }
  }

  if (user?.role !== "admin") return <main className="mx-auto max-w-4xl px-5 py-10"><div className="rounded-2xl border border-[#e8ebf0] bg-white p-7"><ShieldCheck className="size-7 text-[#ed6049]" aria-hidden="true" /><h1 className="mt-4 text-2xl font-semibold">Administrator access required</h1><p className="mt-2 text-sm text-[#687486]">Only a locally designated administrator can review comment reports.</p></div></main>;

  return <main className="min-h-screen bg-[#f7f8fb] px-5 py-8 text-[#172033] sm:px-8">
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e16b55]">Safety desk</p><h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-[-0.05em]"><Flag className="size-7 text-[#ed6049]" aria-hidden="true" /> Comment moderation</h1><p className="mt-2 text-sm text-[#7d8797]">Reports are reviewed by a person. Dislikes never remove comments automatically.</p></div><button type="button" onClick={() => { setLoading(true); void load(); }} disabled={loading} className="rounded-xl border border-[#dfe4eb] bg-white px-4 py-2 text-sm font-semibold text-[#586579] hover:border-[#ed6049] disabled:opacity-50">Refresh queue</button></div>
      {error && <p role="alert" className="mt-5 rounded-xl border border-[#f2d4cd] bg-[#fff7f4] p-4 text-sm text-[#a04e40]">{error}</p>}
      <section className="mt-7" aria-labelledby="pending-heading"><div className="flex items-baseline justify-between"><h2 id="pending-heading" className="text-xl font-semibold">Pending reports</h2><span className="text-sm text-[#8c96a5]">{reports.length} to review</span></div>
        {loading ? <p className="mt-4 rounded-2xl bg-white p-6 text-sm text-[#687486]">Loading reports…</p> : reports.length === 0 ? <p className="mt-4 rounded-2xl border border-[#e8ebf0] bg-white p-6 text-sm text-[#687486]">No reports waiting for review.</p> : <div className="mt-4 space-y-3">{reports.map((report) => <article key={report._id} className="rounded-2xl border border-[#e8ebf0] bg-white p-5 shadow-[0_8px_25px_rgba(28,40,60,0.03)]"><div className="flex flex-wrap items-center gap-2 text-xs text-[#8a94a5]"><span className="rounded-full bg-[#fff0ec] px-2.5 py-1 font-bold capitalize text-[#d95c44]">{report.reason}</span><span>Reported by {report.reporter.name}{report.reporter.username ? ` (@${report.reporter.username})` : ""}</span><span>· {new Date(report.createdAt).toLocaleString("en-IN")}</span></div><p className="mt-3 text-xs font-semibold text-[#586579]">Comment by {report.comment?.author || "Former member"} · text when reported</p><p className="mt-1 whitespace-pre-wrap break-words rounded-xl bg-[#f8f9fb] p-3 text-sm leading-6 text-[#344054]">{report.reportedText}</p>{report.comment?.revision !== report.reportedRevision && <p className="mt-2 text-xs text-[#9a6835]">This comment changed after the report. Current text: {report.comment?.text || "Deleted"}</p>}<div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void review(report, "dismiss")} disabled={busyId !== null} className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4eb] px-3 py-2 text-xs font-semibold text-[#586579] hover:bg-[#f8f9fb] disabled:opacity-50"><Check className="size-4" aria-hidden="true" /> Dismiss report</button><button type="button" onClick={() => void review(report, "remove")} disabled={busyId !== null || Boolean(report.comment?.deletedAt)} className="inline-flex items-center gap-2 rounded-lg bg-[#b94f43] px-3 py-2 text-xs font-semibold text-white hover:bg-[#a44237] disabled:opacity-50"><Trash2 className="size-4" aria-hidden="true" /> Remove comment</button>{report.comment && <Link href={`/watch/${report.comment.videoId}`} className="text-xs font-semibold text-[#d95c44] hover:underline">Open video</Link>}</div></article>)}</div>}
      </section>
      <section className="mt-9 pb-10" aria-labelledby="activity-heading"><h2 id="activity-heading" className="text-xl font-semibold">Review log</h2><div className="mt-4 rounded-2xl border border-[#e8ebf0] bg-white p-5">{logs.length === 0 ? <p className="text-sm text-[#687486]">No moderation decisions yet.</p> : <ol className="divide-y divide-[#edf0f4]">{logs.map((entry) => <li key={entry._id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span><span className="font-semibold capitalize">{entry.decision === "remove" ? "Removed comment" : "Dismissed report"}</span><span className="ml-2 text-[#7d8797]">for {entry.reason} · by {entry.admin}</span></span><time className="text-xs text-[#9aa3b2]">{new Date(entry.createdAt).toLocaleString("en-IN")}</time></li>)}</ol>}</div></section>
    </div>
  </main>;
}
