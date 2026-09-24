"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Clapperboard,
  Film,
  LayoutDashboard,
  LogOut,
  Menu,
  Crown,
  History,
  Play,
  Plus,
  Search,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContent";
import ChannelDialogue from "@/components/channeldialgoue";
import LocalVideoCard from "@/components/local-video-card";
import type { LocalVideo } from "@/lib/local-video";
import styles from "./dashboard.module.css";

type LibraryState = "loading" | "ready" | "error";

export default function DashboardPage() {
  const router = useRouter();
  const { user, logout } = useUser();
  const [videos, setVideos] = useState<LocalVideo[]>([]);
  const [libraryState, setLibraryState] = useState<LibraryState>("loading");
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    let active = true;
    axiosInstance.get("/video/getall")
      .then((response) => {
        if (!active) return;
        const result = Array.isArray(response.data) ? response.data : response.data?.videos;
        setVideos(Array.isArray(result) ? result : []);
        setLibraryState("ready");
      })
      .catch(() => {
        if (active) setLibraryState("error");
      });
    return () => { active = false; };
  }, [refreshKey]);

  const matchingVideos = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return videos;
    return videos.filter((video) =>
      `${video.videotitle} ${video.videochanel}`.toLowerCase().includes(query),
    );
  }, [searchQuery, videos]);

  const firstName = String(user?.name || "there").trim().split(/\s+/)[0];
  const channelUrl = user?._id ? `/channel/${user._id}` : "/dashboard";

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      await logout();
      router.replace("/sign-in");
    } catch {
      setSignOutError("Could not sign out. Please try again.");
      setSigningOut(false);
    }
  }

  return (
    <main className={`${styles.dashboard} min-h-screen bg-[#f7f8fb] text-[#172033]`}>
      {sidebarOpen && (
        <button type="button" aria-label="Close navigation" className="fixed inset-0 z-40 bg-[#101729]/55 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[252px] flex-col border-r border-[#e9ecf2] bg-white px-4 py-6 transition-transform md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`} aria-label="Dashboard navigation">
        <div className="flex items-center justify-between px-2">
          <Link href="/dashboard" className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ec684f]" onClick={() => setSidebarOpen(false)}>
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#ed6049] text-white shadow-[0_7px_15px_rgba(237,96,73,0.2)]">
              <Play className="ml-0.5 size-[18px] fill-current" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="text-xl font-bold tracking-[-0.06em] text-[#172033]">VidCircle<span className="text-[#ed6049]">.</span></span>
          </Link>
          <button type="button" className="rounded-lg p-1 text-[#667084] hover:bg-[#f3f5f8] md:hidden" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}>
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-14 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#9aa3b2]">Workspace</div>
        <nav className="mt-4 space-y-1" aria-label="Main navigation">
          <Link href="/dashboard" className="flex items-center gap-3 rounded-xl bg-[#fff0ec] px-4 py-3 text-sm font-semibold text-[#d95c44]" aria-current="page" onClick={() => setSidebarOpen(false)}>
            <LayoutDashboard className="size-[18px]" aria-hidden="true" /> Dashboard
          </Link>
          <Link href="/subscriptions" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[#657084] transition hover:bg-[#f6f7f9] hover:text-[#172033]" onClick={() => setSidebarOpen(false)}>
            <Crown className="size-[18px]" aria-hidden="true" /> Membership
          </Link>
          <Link href="/history" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[#657084] transition hover:bg-[#f6f7f9] hover:text-[#172033]" onClick={() => setSidebarOpen(false)}>
            <History className="size-[18px]" aria-hidden="true" /> Watch history
          </Link>
          <a href="#video-library" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[#657084] transition hover:bg-[#f6f7f9] hover:text-[#172033]" onClick={() => setSidebarOpen(false)}>
            <Film className="size-[18px]" aria-hidden="true" /> Video library
          </a>
          {user?.channelname ? (
            <Link href={channelUrl} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[#657084] transition hover:bg-[#f6f7f9] hover:text-[#172033]" onClick={() => setSidebarOpen(false)}>
              <UserRound className="size-[18px]" aria-hidden="true" /> My channel
            </Link>
          ) : (
            <button type="button" className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-[#657084] transition hover:bg-[#f6f7f9] hover:text-[#172033]" onClick={() => { setSidebarOpen(false); setChannelOpen(true); }}>
              <Plus className="size-[18px]" aria-hidden="true" /> Create channel
            </button>
          )}
        </nav>

        <div className="mt-auto space-y-4">
          <div className="rounded-2xl bg-[#f6f4ff] p-4">
            <div className="flex size-9 items-center justify-center rounded-xl bg-white text-[#6755a5] shadow-sm"><Sparkles className="size-[18px]" aria-hidden="true" /></div>
            <p className="mt-3 text-sm font-semibold text-[#332d52]">Made to grow with you</p>
            <p className="mt-1 text-xs leading-5 text-[#78718f]">Your videos and account stay in this local prototype.</p>
          </div>
          <button type="button" disabled={signingOut} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-[#657084] transition hover:bg-[#f6f7f9] hover:text-[#172033] disabled:opacity-50" onClick={() => { void handleSignOut(); }}>
            <LogOut className="size-[18px]" aria-hidden="true" /> {signingOut ? "Signing out…" : "Sign out"}
          </button>
          {signOutError && <p role="alert" className="px-4 text-xs text-[#ae3b2a]">{signOutError}</p>}
        </div>
      </aside>

      <div className="min-w-0 md:pl-[252px]">
        <header className="sticky top-0 z-30 flex min-h-[76px] flex-wrap items-center gap-4 border-b border-[#e9ecf2] bg-white/95 px-5 py-3 backdrop-blur-md sm:px-8 lg:px-10">
          <button type="button" className="rounded-lg p-2 text-[#586377] hover:bg-[#f4f6f8] md:hidden" aria-label="Open navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}>
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <div className="mr-auto min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a1a9b7]">Your workspace</p>
            <p className="text-[17px] font-semibold tracking-[-0.035em] text-[#172033]">Dashboard</p>
          </div>
          <label className="order-3 flex h-11 w-full items-center gap-3 rounded-xl border border-[#e6e9ef] bg-[#f8f9fb] px-4 text-[#929aaa] transition focus-within:border-[#ed6049] focus-within:ring-4 focus-within:ring-[#ed6049]/10 sm:order-none sm:mr-2 sm:max-w-[360px]" htmlFor="dashboard-search">
            <Search className="size-[18px] shrink-0" aria-hidden="true" />
            <input id="dashboard-search" type="search" aria-label="Search local videos" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search local videos" className="min-w-0 flex-1 bg-transparent text-sm text-[#172033] outline-none placeholder:text-[#a0a8b5]" />
          </label>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f7e0d8] text-sm font-bold text-[#bd634e]" aria-label={`Signed in as ${user?.name || "user"}`}>
            {String(user?.name || "U").slice(0, 1).toUpperCase()}
          </div>
        </header>

        <div className="mx-auto max-w-[1510px] space-y-7 px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
          <section className={`${styles.hero} relative overflow-hidden rounded-[28px] px-7 py-9 text-white sm:px-10 sm:py-11`}>
            <div className="relative z-10 max-w-[560px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#ffe7df]">
                <span className="size-1.5 rounded-full bg-[#ffa98e]" /> Your creative space
              </span>
              <h1 className="mt-5 text-[clamp(2rem,3.7vw,3.5rem)] leading-[1.08] font-semibold tracking-[-0.06em]">
                Welcome back,<br /><span className="text-[#ffb29b]">{firstName}.</span>
              </h1>
              <p className="mt-4 max-w-[420px] text-sm leading-6 text-[#d6dae8] sm:text-[15px] sm:leading-7">
                This is where your videos, your channel, and the conversations around them come together.
              </p>
              {user?.channelname ? (
                <Link href={channelUrl} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#ed6049] px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(237,96,73,0.24)] transition hover:bg-[#de553e] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white">
                  Upload a video <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              ) : (
                <button type="button" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#ed6049] px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(237,96,73,0.24)] transition hover:bg-[#de553e] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white" onClick={() => setChannelOpen(true)}>
                  Create your channel <ArrowRight className="size-4" aria-hidden="true" />
                </button>
              )}
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

          <section className="grid gap-4 sm:grid-cols-3" aria-label="Workspace overview">
            <div className="rounded-2xl border border-[#e8ebf0] bg-white p-5 shadow-[0_8px_22px_rgba(24,33,55,0.025)]">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[#fff0ec] text-[#e56a51]"><Film className="size-5" aria-hidden="true" /></div>
              <p className="mt-4 text-2xl font-semibold tracking-[-0.06em]">{libraryState === "ready" ? videos.length : "—"}</p>
              <p className="mt-1 text-sm text-[#7b8494]">Videos in the library</p>
            </div>
            <div className="rounded-2xl border border-[#e8ebf0] bg-white p-5 shadow-[0_8px_22px_rgba(24,33,55,0.025)]">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[#efedff] text-[#7363b1]"><UserRound className="size-5" aria-hidden="true" /></div>
              <p className="mt-4 truncate text-base font-semibold tracking-[-0.035em] sm:text-lg">{user?.channelname || "Not created yet"}</p>
              <p className="mt-1 text-sm text-[#7b8494]">Your channel</p>
            </div>
            <div className="rounded-2xl border border-[#e8ebf0] bg-white p-5 shadow-[0_8px_22px_rgba(24,33,55,0.025)]">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[#e9f5f1] text-[#399877]"><Sparkles className="size-5" aria-hidden="true" /></div>
              <p className="mt-4 text-base font-semibold tracking-[-0.035em] sm:text-lg">Local prototype</p>
              <p className="mt-1 text-sm text-[#7b8494]">No cloud services connected</p>
            </div>
          </section>

          <section id="video-library" className="scroll-mt-28 pb-12" aria-live="polite">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e16b55]">Explore</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-[#172033]">The video library</h2>
                <p className="mt-1 text-sm text-[#7d8797]">A home for every story shared on VidCircle.</p>
              </div>
              {libraryState === "ready" && videos.length > 0 && <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#7b8494]">{matchingVideos.length} {matchingVideos.length === 1 ? "video" : "videos"}</span>}
            </div>

            {libraryState === "loading" && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading videos">
                {[0, 1, 2].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl bg-[#e8ebf0]" />)}
              </div>
            )}

            {libraryState === "error" && (
              <div className="rounded-3xl border border-[#f3d5cf] bg-[#fff7f4] px-6 py-12 text-center">
                <h3 className="text-lg font-semibold text-[#7a3b31]">Could not load the local library</h3>
                <p className="mt-2 text-sm text-[#a56b60]">Check that the local API is running, then try again.</p>
                <button type="button" className="mt-5 rounded-xl bg-[#ed6049] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#dc523c]" onClick={() => { setLibraryState("loading"); setRefreshKey((value) => value + 1); }}>Retry</button>
              </div>
            )}

            {libraryState === "ready" && videos.length === 0 && (
              <div className="flex flex-col items-center rounded-[28px] border border-[#e8ebf0] bg-white px-6 py-12 text-center shadow-[0_10px_30px_rgba(24,33,55,0.025)] sm:py-14">
                <div className={styles.emptyArt} aria-hidden="true">
                  <div className={styles.emptyBack} />
                  <div className={styles.emptyFront}><Clapperboard className="size-10 text-white" strokeWidth={1.5} /></div>
                </div>
                <h3 className="mt-7 text-xl font-semibold tracking-[-0.045em] text-[#172033]">Your video library starts here</h3>
                <p className="mt-2 max-w-[420px] text-sm leading-6 text-[#7b8494]">No videos have been added to this local workspace yet. Upload an MP4 to start your library.</p>
                {user?.channelname ? (
                  <Link href={channelUrl} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#dd604b] hover:text-[#bd4936]">Upload your first video <ArrowRight className="size-4" aria-hidden="true" /></Link>
                ) : (
                  <button type="button" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#dd604b] hover:text-[#bd4936]" onClick={() => setChannelOpen(true)}>Create your channel <ArrowRight className="size-4" aria-hidden="true" /></button>
                )}
              </div>
            )}

            {libraryState === "ready" && videos.length > 0 && matchingVideos.length === 0 && (
              <div className="rounded-3xl border border-[#e8ebf0] bg-white px-6 py-14 text-center">
                <h3 className="text-lg font-semibold">No matching videos</h3>
                <p className="mt-2 text-sm text-[#7b8494]">Try another title or channel name.</p>
                <button type="button" className="mt-4 text-sm font-semibold text-[#dd604b] hover:underline" onClick={() => setSearchQuery("")}>Clear search</button>
              </div>
            )}

            {libraryState === "ready" && matchingVideos.length > 0 && (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {matchingVideos.map((video) => <LocalVideoCard key={video._id} video={video} />)}
              </div>
            )}
          </section>
        </div>
      </div>

      <ChannelDialogue isopen={channelOpen} onclose={() => setChannelOpen(false)} mode="create" />
    </main>
  );
}
