"use client";

import Link from "next/link";
import { ArrowLeft, Play } from "lucide-react";
import { useUser } from "@/lib/AuthContent";

export default function WorkspaceTopbar({ section }: { section: string }) {
  const { user } = useUser();
  return (
    <header className="border-b border-[#e9ecf2] bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex min-h-[74px] max-w-[1510px] items-center gap-4 px-5 sm:px-8 lg:px-10">
        <Link href="/dashboard" className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ec684f]">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[#ed6049] text-white shadow-[0_7px_15px_rgba(237,96,73,0.2)]"><Play className="ml-0.5 size-[18px] fill-current" strokeWidth={1.5} aria-hidden="true" /></span>
          <span className="text-xl font-bold tracking-[-0.06em] text-[#172033]">VidCircle<span className="text-[#ed6049]">.</span></span>
        </Link>
        <span className="hidden h-6 w-px bg-[#e8ebf0] sm:block" />
        <span className="hidden text-sm font-semibold text-[#7d8797] sm:block">{section}</span>
        <Link href="/dashboard" className="ml-auto inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[#596578] transition hover:bg-[#f5f6f9] hover:text-[#172033]"><ArrowLeft className="size-4" aria-hidden="true" /> Dashboard</Link>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f7e0d8] text-sm font-bold text-[#bd634e]" aria-label={`Signed in as ${user?.name || "user"}`}>
          {String(user?.name || "U").slice(0, 1).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
