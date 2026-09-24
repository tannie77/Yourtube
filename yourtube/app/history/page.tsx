"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock3 } from "lucide-react";
import WorkspaceTopbar from "@/components/workspace-topbar";
import axiosInstance from "@/lib/axiosinstance";
import { accessPlanName, type LocalVideo } from "@/lib/local-video";

type Entry = { viewedOn: string; video: LocalVideo };

export default function HistoryPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void axiosInstance.get<Entry[]>("/video/history/me")
      .then((response) => { if (active) setEntries(response.data); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#172033] [font-family:'Avenir_Next',Avenir,'Segoe_UI',ui-sans-serif,system-ui,sans-serif]">
      <WorkspaceTopbar section="Watch history" />
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-[#687486] hover:text-[#ed6049]"><ArrowLeft className="size-4" aria-hidden="true" /> Back to library</Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-[-0.05em]">Watch history</h1>
        <p className="mt-2 text-sm text-[#7d8797]">Your local viewing record remains here even if a membership expires.</p>
        {loading ? <p className="mt-8 rounded-2xl bg-white p-6 text-[#697486]">Loading watch history…</p> : error ? <p role="alert" className="mt-8 rounded-2xl bg-white p-6 text-[#a34d3d]">Could not load your history. Check the local API.</p> : entries.length === 0 ? <p className="mt-8 rounded-2xl bg-white p-6 text-[#697486]">No videos watched yet.</p> : (
          <div className="mt-8 space-y-3">{entries.map(({ viewedOn, video }) => <Link key={video._id} href={`/watch/${video._id}`} className="flex items-center justify-between gap-4 rounded-2xl border border-[#e8ebf0] bg-white p-5 transition hover:border-[#edb3a7]"><div><h2 className="font-semibold">{video.videotitle}</h2><p className="mt-1 text-xs text-[#7d8797]">{video.videochanel} · {video.canWatch ? "Available now" : `${accessPlanName(video.accessPlan)} plan required now`}</p></div><span className="flex shrink-0 items-center gap-2 text-xs text-[#8d96a5]"><Clock3 className="size-4" aria-hidden="true" />{new Date(viewedOn).toLocaleDateString("en-IN")}</span></Link>)}</div>
        )}
      </div>
    </main>
  );
}
