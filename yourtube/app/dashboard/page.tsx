"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Crown, History, Play, UserRound } from "lucide-react";
import ChannelDialogue from "@/components/channeldialgoue";
import { useUser } from "@/lib/AuthContent";
import styles from "./dashboard.module.css";

export default function DashboardPage() {
  const { user } = useUser();
  const [channelOpen, setChannelOpen] = useState(false);
  const firstName = String(user?.name || "there").trim().split(/\s+/)[0];
  const channelUrl = user?._id ? `/channel/${user._id}` : "/dashboard";

  return (
    <main className={`${styles.dashboard} min-h-screen bg-[#f7f8fb] dark:bg-[#101624] text-[#172033] dark:text-[#e6ecf7]`}>
      <div className="mx-auto max-w-[1510px] space-y-8 px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        <section className={`${styles.hero} relative overflow-hidden rounded-[28px] px-7 py-9 text-white sm:px-10 sm:py-11`}>
          <div className="relative z-10 max-w-[560px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#ffe7df]">
              <span className="size-1.5 rounded-full bg-[#ffa98e]" /> Your creative space
            </span>
            <h1 className="mt-5 text-[clamp(2rem,3.7vw,3.5rem)] leading-[1.08] font-semibold tracking-[-0.06em]">
              Welcome back,<br /><span className="text-[#ffb29b]">{firstName}.</span>
            </h1>
            <p className="mt-4 max-w-[420px] text-sm leading-6 text-[#d6dae8] sm:text-[15px] sm:leading-7">
              Your space to watch, create, and connect. Pick up wherever you left off.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Link href="/library" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#ed6049] px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(237,96,73,0.24)] transition hover:bg-[#de553e] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white">
                Explore videos <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              {user?.channelname ? (
                <Link href={channelUrl} className="inline-flex h-11 items-center gap-2 text-sm font-semibold text-white/85 transition hover:text-white">Manage your channel <ArrowRight className="size-4" aria-hidden="true" /></Link>
              ) : (
                <button type="button" className="inline-flex h-11 items-center gap-2 text-sm font-semibold text-white/85 transition hover:text-white" onClick={() => setChannelOpen(true)}>Create your channel <ArrowRight className="size-4" aria-hidden="true" /></button>
              )}
            </div>
          </div>
          <div className={styles.heroArtwork} aria-hidden="true">
            <div className={styles.heroOrbit} />
            <div className={styles.heroScreen}>
              <div className={styles.heroSun} />
              <div className={styles.heroHillBack} />
              <div className={styles.heroHillFront} />
              <span className={styles.heroPlay}><Play className="ml-0.5 size-6 fill-current" strokeWidth={1.5} /></span>
            </div>
            <div className={styles.heroMiniCard}><span className="size-2 rounded-full bg-[#ed6049]" /> WATCH · CREATE · CONNECT</div>
          </div>
        </section>

        <section aria-labelledby="workspace-heading" className="pb-12">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e16b55] dark:text-[#ff9b87]">Your workspace</p>
          <h2 id="workspace-heading" className="mt-1 text-2xl font-semibold tracking-[-0.05em]">Where would you like to go?</h2>
          <p className="mt-1 text-sm text-[#7d8797] dark:text-[#aab5c8]">Everything in this prototype is available from the navigation on the left.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Link href="/history" className="group rounded-2xl border border-[#e8ebf0] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] p-6 shadow-[0_8px_22px_rgba(24,33,55,0.025)] transition hover:-translate-y-0.5 hover:border-[#f0c4b9] dark:hover:border-[#73505a] hover:shadow-[0_18px_34px_rgba(24,33,55,0.07)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ed6049]">
              <span className="flex size-11 items-center justify-center rounded-xl bg-[#fff0ec] dark:bg-[#43313a] text-[#e56a51] dark:text-[#ff9b87]"><History className="size-5" aria-hidden="true" /></span>
              <h3 className="mt-5 text-lg font-semibold tracking-[-0.04em]">Watch history</h3>
              <p className="mt-2 text-sm leading-6 text-[#7b8494] dark:text-[#aab5c8]">Pick up from the videos you watched.</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#d95c44] dark:text-[#ff9b87]">View history <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden="true" /></span>
            </Link>
            <Link href="/subscriptions" className="group rounded-2xl border border-[#e8ebf0] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] p-6 shadow-[0_8px_22px_rgba(24,33,55,0.025)] transition hover:-translate-y-0.5 hover:border-[#d6cdec] dark:hover:border-[#555073] hover:shadow-[0_18px_34px_rgba(24,33,55,0.07)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ed6049]">
              <span className="flex size-11 items-center justify-center rounded-xl bg-[#efedff] dark:bg-[#35314b] text-[#7363b1] dark:text-[#c9baff]"><Crown className="size-5" aria-hidden="true" /></span>
              <h3 className="mt-5 text-lg font-semibold tracking-[-0.04em]">Membership</h3>
              <p className="mt-2 text-sm leading-6 text-[#7b8494] dark:text-[#aab5c8]">See your plan and try the local checkout.</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#d95c44] dark:text-[#ff9b87]">View plans <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden="true" /></span>
            </Link>
            {user?.channelname ? (
              <Link href={channelUrl} className="group rounded-2xl border border-[#e8ebf0] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] p-6 shadow-[0_8px_22px_rgba(24,33,55,0.025)] transition hover:-translate-y-0.5 hover:border-[#c7e5da] dark:hover:border-[#49685a] hover:shadow-[0_18px_34px_rgba(24,33,55,0.07)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ed6049]">
                <span className="flex size-11 items-center justify-center rounded-xl bg-[#e9f5f1] dark:bg-[#273d3a] text-[#399877] dark:text-[#91d7ae]"><UserRound className="size-5" aria-hidden="true" /></span>
                <h3 className="mt-5 truncate text-lg font-semibold tracking-[-0.04em]">{user.channelname}</h3>
                <p className="mt-2 text-sm leading-6 text-[#7b8494] dark:text-[#aab5c8]">Upload and manage videos in your channel.</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#d95c44] dark:text-[#ff9b87]">Open channel <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden="true" /></span>
              </Link>
            ) : (
              <button type="button" className="group rounded-2xl border border-[#e8ebf0] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] p-6 text-left shadow-[0_8px_22px_rgba(24,33,55,0.025)] transition hover:-translate-y-0.5 hover:border-[#c7e5da] dark:hover:border-[#49685a] hover:shadow-[0_18px_34px_rgba(24,33,55,0.07)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ed6049]" onClick={() => setChannelOpen(true)}>
                <span className="flex size-11 items-center justify-center rounded-xl bg-[#e9f5f1] dark:bg-[#273d3a] text-[#399877] dark:text-[#91d7ae]"><UserRound className="size-5" aria-hidden="true" /></span>
                <h3 className="mt-5 text-lg font-semibold tracking-[-0.04em]">Your channel</h3>
                <p className="mt-2 text-sm leading-6 text-[#7b8494] dark:text-[#aab5c8]">Create a channel to start uploading.</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#d95c44] dark:text-[#ff9b87]">Create channel <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden="true" /></span>
              </button>
            )}
          </div>
        </section>
      </div>
      <ChannelDialogue isopen={channelOpen} onclose={() => setChannelOpen(false)} mode="create" />
    </main>
  );
}
