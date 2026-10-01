import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AxiosError } from "axios";
import { Check, Flag, RotateCw, ShieldCheck, Trash2 } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";

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

function errorMessage(error: unknown) {
  if (error instanceof AxiosError && typeof error.response?.data?.message === "string") return error.response.data.message;
  return "Could not load moderation data. Check the local API.";
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

export default function ModerationPage() {
  const { user, loading: userLoading } = useUser();
  const [reports, setReports] = useState<Report[]>([]);
  const [logs, setLogs] = useState<ModerationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get<{ reports: Report[]; logs: ModerationLog[] }>("/comment/moderation/queue");
      setReports(response.data.reports);
      setLogs(response.data.logs);
      setError("");
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user?.role === "admin") void load(); }, [user?.role, load]);

  async function review(report: Report, decision: "dismiss" | "remove") {
    if (decision === "remove" && !window.confirm("Remove this comment for everyone? Replies will stay visible.")) return;
    setBusyId(report._id);
    setError("");
    try {
      await axiosInstance.post(`/comment/moderation/${report._id}`, { decision });
      await load();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusyId(null); }
  }

  if (userLoading) return <main className="yt-page yt-page-narrow"><p className="yt-subtle">Loading moderation…</p></main>;
  if (user?.role !== "admin") return <main className="yt-page yt-page-narrow"><div className="yt-moderation-empty"><ShieldCheck aria-hidden="true" /><h1>Administrator access required</h1><p>Only a locally designated administrator can review comment reports.</p></div></main>;

  return <main className="yt-page yt-page-narrow yt-moderation">
    <div className="yt-page-header"><div><span className="yt-page-eyebrow">Safety desk</span><h1 className="yt-page-title">Comment moderation</h1><p className="yt-page-description">Review reports from viewers. Dislikes never remove comments automatically.</p></div><button type="button" className="yt-pill-button" disabled={loading} onClick={() => void load()}><RotateCw aria-hidden="true" />Refresh queue</button></div>
    {error && <p role="alert" className="yt-comment-error">{error}</p>}
    <section aria-labelledby="pending-heading"><div className="yt-moderation-section-heading"><h2 id="pending-heading">Pending reports</h2><span>{reports.length} to review</span></div>
      {loading ? <p className="yt-moderation-empty">Loading reports…</p> : reports.length === 0 ? <p className="yt-moderation-empty">No reports waiting for review.</p> : <div className="yt-moderation-list">{reports.map((report) => <article key={report._id} className="yt-moderation-card"><div className="yt-moderation-meta"><span className="yt-moderation-reason"><Flag aria-hidden="true" />{report.reason}</span><span>Reported by {report.reporter.name}{report.reporter.username ? ` (@${report.reporter.username})` : ""}</span><time>{dateLabel(report.createdAt)}</time></div><p className="yt-moderation-caption">Comment by {report.comment?.author || "Former member"} · text when reported</p><p className="yt-moderation-quote">{report.reportedText}</p>{report.comment && report.comment.revision !== report.reportedRevision && <p className="yt-moderation-changed">This comment changed after the report. Current text: {report.comment.text || "Deleted"}</p>}<div className="yt-moderation-actions"><button type="button" className="yt-pill-button" disabled={busyId !== null} onClick={() => void review(report, "dismiss")}><Check aria-hidden="true" />Dismiss report</button><button type="button" className="yt-primary-button" disabled={busyId !== null || Boolean(report.comment?.deletedAt)} onClick={() => void review(report, "remove")}><Trash2 aria-hidden="true" />Remove comment</button>{report.comment && <Link href={`/watch/${report.comment.videoId}`}>Open video</Link>}</div></article>)}</div>}
    </section>
    <section aria-labelledby="review-log-heading"><div className="yt-moderation-section-heading"><h2 id="review-log-heading">Review log</h2></div><div className="yt-moderation-card">{logs.length === 0 ? <p className="yt-subtle">No moderation decisions yet.</p> : <ol className="yt-moderation-log">{logs.map((entry) => <li key={entry._id}><span><strong>{entry.decision === "remove" ? "Removed comment" : "Dismissed report"}</strong> for {entry.reason} · by {entry.admin}</span><time>{dateLabel(entry.createdAt)}</time></li>)}</ol>}</div></section>
  </main>;
}
