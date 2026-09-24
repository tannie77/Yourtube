"use client";

import Link from "next/link";
import { LockKeyhole, Play } from "lucide-react";
import { accessPlanName, addedDate, type LocalVideo } from "@/lib/local-video";

export default function LocalVideoCard({ video }: { video: LocalVideo }) {
  const locked = !video.canWatch;
  return (
    <Link href={`/watch/${video._id}`} className="group overflow-hidden rounded-2xl border border-[#e8ebf0] bg-white shadow-[0_8px_22px_rgba(24,33,55,0.025)] transition hover:-translate-y-1 hover:shadow-[0_18px_35px_rgba(24,33,55,0.08)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#ed6049]">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_68%_28%,#efb69f,transparent_33%),linear-gradient(135deg,#514d81,#bd7891_58%,#e39a78)]">
        <div className="absolute inset-0 bg-gradient-to-t from-[#11172a]/55 via-transparent to-transparent" />
        <span className="absolute top-4 left-4 rounded-full border border-white/30 bg-[#172033]/35 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-sm">{video.earlyAccessActive ? "Gold early access" : video.accessPlan === "free" ? "Free to watch" : `${accessPlanName(video.accessPlan)} plan`}</span>
        {video.sourceQuality && <span className="absolute top-4 right-4 rounded-full border border-white/30 bg-[#172033]/35 px-3 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">{video.sourceQuality} source</span>}
        <span className="relative z-10 flex size-12 items-center justify-center rounded-full border border-white/70 bg-white/25 text-white backdrop-blur-sm transition group-hover:scale-110">{locked ? <LockKeyhole className="size-5" aria-hidden="true" /> : <Play className="ml-0.5 size-5 fill-current" strokeWidth={1.5} aria-hidden="true" />}</span>
      </div>
      <div className="p-5">
        <h3 className="line-clamp-2 text-base font-semibold tracking-[-0.03em] text-[#172033]">{video.videotitle}</h3>
        <p className="mt-2 text-sm text-[#697486]">{video.videochanel}</p>
        <p className="mt-3 text-xs text-[#9aa3b2]">{locked ? `Membership needed · ${accessPlanName(video.accessPlan)} or higher` : addedDate(video.createdAt)}</p>
      </div>
    </Link>
  );
}
