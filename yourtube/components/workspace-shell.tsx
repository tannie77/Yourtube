"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Crown,
  Download,
  Film,
  History,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Play,
  Plus,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import ChannelDialogue from "@/components/channeldialgoue";
import { useUser } from "@/lib/AuthContent";
import axiosInstance from "@/lib/axiosinstance";
import { SUBSCRIPTION_UPDATED_EVENT } from "@/lib/subscription-events";
import type { SubscriptionSnapshot } from "@/lib/subscriptions";

const WorkspaceLayoutContext = createContext<{ setFocusMode: (enabled: boolean) => void } | null>(null);

export function useWorkspaceLayout() {
  const context = useContext(WorkspaceLayoutContext);
  if (!context) throw new Error("useWorkspaceLayout must be used within WorkspaceShell");
  return context;
}

function NavigationContent({
  compact,
  pinnedCompact,
  mobile,
  pathname,
  planLabel,
  compactPlanLabel,
  onNavigate,
  onToggleCompact,
  onCreateChannel,
  onSignOut,
  signingOut,
  signOutError,
}: {
  compact: boolean;
  pinnedCompact: boolean;
  mobile: boolean;
  pathname: string;
  planLabel: string;
  compactPlanLabel: string;
  onNavigate: () => void;
  onToggleCompact: () => void;
  onCreateChannel: () => void;
  onSignOut: () => void;
  signingOut: boolean;
  signOutError: string;
}) {
  const { user } = useUser();
  const toggleLabel = mobile ? "Close navigation" : pinnedCompact ? compact ? "Expand navigation" : "Keep navigation expanded" : "Collapse navigation";
  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, active: pathname === "/dashboard" },
    { href: "/library", label: "Video library", icon: Film, active: pathname === "/library" || pathname.startsWith("/watch/") },
    { href: "/subscriptions", label: "Membership", icon: Crown, active: pathname === "/subscriptions" },
    { href: "/history", label: "Watch history", icon: History, active: pathname === "/history" },
    { href: "/downloads", label: "Downloads", icon: Download, active: pathname === "/downloads" },
    { href: "/security", label: "Security", icon: LockKeyhole, active: pathname === "/security" },
    ...(user?.role === "admin" ? [{ href: "/moderation", label: "Moderation", icon: ShieldCheck, active: pathname === "/moderation" }] : []),
  ];
  const itemClass = (active = false) =>
    `flex min-h-11 w-full items-center gap-3 rounded-xl py-3 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ed6049] ${compact ? "justify-center px-0" : "px-4"} ${active ? "bg-[#fff0ec] font-semibold text-[#d95c44] dark:bg-[#4a2a28] dark:text-[#ffb5a7]" : "font-medium text-[#657084] hover:bg-[#f6f7f9] hover:text-[#172033] dark:text-[#aab5c8] dark:hover:bg-[#202a40] dark:hover:text-white"}`;

  return (
    <>
      <div className={`flex ${compact ? "flex-col gap-3" : "items-center justify-between gap-2"}`}>
        <Link href="/dashboard" aria-label="VidCircle dashboard" title={compact ? "VidCircle dashboard" : undefined} className="inline-flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ec684f]" onClick={onNavigate}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#ed6049] text-white shadow-[0_7px_15px_rgba(237,96,73,0.2)]">
            <Play className="ml-0.5 size-[18px] fill-current" strokeWidth={1.5} aria-hidden="true" />
          </span>
          {!compact && <span className="truncate text-xl font-bold tracking-[-0.06em] text-[#172033] dark:text-[#edf1f7]">VidCircle<span className="text-[#ed6049]">.</span></span>}
        </Link>
        <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[#667084] transition hover:bg-[#f3f5f8] focus-visible:outline-2 focus-visible:outline-[#ed6049] dark:text-[#aab5c8] dark:hover:bg-[#202a40]" aria-label={toggleLabel} aria-expanded={mobile ? undefined : !compact} title={toggleLabel} onClick={mobile ? onNavigate : onToggleCompact}>
          {mobile ? <X className="size-5" aria-hidden="true" /> : pinnedCompact ? compact ? <PanelLeftOpen className="size-5" aria-hidden="true" /> : <Pin className="size-4" aria-hidden="true" /> : <PanelLeftClose className="size-5" aria-hidden="true" />}
        </button>
      </div>

      <div className={`mt-12 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#9aa3b2] ${compact ? "sr-only" : ""}`}>Workspace</div>
      <nav className="mt-4 space-y-1" aria-label="Main navigation">
        {navItems.map(({ href, label, icon: Icon, active }) => (
          <Link key={label} href={href} title={compact ? label : undefined} aria-label={label} aria-current={active ? "page" : undefined} className={itemClass(active)} onClick={onNavigate}>
            <Icon className="size-[18px] shrink-0" aria-hidden="true" />{!compact && <span>{label}</span>}
          </Link>
        ))}
        {user?.channelname ? (
          <Link href={`/channel/${user._id}`} title={compact ? "My channel" : undefined} aria-label="My channel" aria-current={pathname === `/channel/${user._id}` ? "page" : undefined} className={itemClass(pathname === `/channel/${user._id}`)} onClick={onNavigate}>
            <UserRound className="size-[18px] shrink-0" aria-hidden="true" />{!compact && <span>My channel</span>}
          </Link>
        ) : (
          <button type="button" title={compact ? "Create channel" : undefined} aria-label="Create channel" className={itemClass()} onClick={onCreateChannel}>
            <Plus className="size-[18px] shrink-0" aria-hidden="true" />{!compact && <span>Create channel</span>}
          </button>
        )}
      </nav>

      <div className="mt-auto space-y-2 border-t border-[#edf0f4] pt-4 dark:border-[#303a50]">
        <Link href="/subscriptions" title={compact ? `${user?.name || "Your account"} · ${planLabel}` : undefined} aria-label={`Account: ${user?.name || "Your account"}, ${planLabel}`} className={`flex rounded-xl bg-[#f7f8fb] text-[#344054] transition hover:bg-[#fff0ec] focus-visible:outline-2 focus-visible:outline-[#ed6049] dark:bg-[#202a40] dark:text-[#dce3ee] dark:hover:bg-[#4a2a28] ${compact ? "flex-col items-center gap-1 px-1 py-2" : "items-center gap-3 px-3 py-3"}`} onClick={onNavigate}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f7e0d8] text-sm font-bold text-[#bd634e]">{String(user?.name || "U").slice(0, 1).toUpperCase()}</span>
          {compact ? <span className="max-w-full truncate text-[9px] font-bold uppercase tracking-tight text-[#d95c44]">{compactPlanLabel}</span> : <span className="min-w-0"><span className="block truncate text-sm font-semibold">{user?.name || "Your account"}</span><span className="mt-0.5 block text-xs font-medium text-[#d95c44]">{planLabel}</span></span>}
        </Link>
        <button type="button" disabled={signingOut} title={compact ? "Sign out" : undefined} aria-label="Sign out" className={`${itemClass()} disabled:opacity-50`} onClick={onSignOut}>
          <LogOut className="size-[18px] shrink-0" aria-hidden="true" />{!compact && <span>{signingOut ? "Signing out…" : "Sign out"}</span>}
        </button>
        {signOutError && <p role="alert" className={`text-xs text-[#ae3b2a] ${compact ? "sr-only" : "px-4"}`}>{signOutError}</p>}
      </div>
    </>
  );
}

export default function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedElsewhere, setCollapsedElsewhere] = useState(false);
  const [expandedOnWatch, setExpandedOnWatch] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [planId, setPlanId] = useState<SubscriptionSnapshot["effectivePlanId"] | null>(null);
  const [planState, setPlanState] = useState<"loading" | "ready" | "error">("loading");
  const isWatch = pathname.startsWith("/watch/");
  const pinnedCompact = isWatch ? !expandedOnWatch : collapsedElsewhere;
  const compact = pinnedCompact && !hoverExpanded;
  const planName = planId ? planId.charAt(0).toUpperCase() + planId.slice(1) : null;
  const planLabel = planState === "ready" && planName ? `${planName} plan` : planState === "error" ? "Plan unavailable" : "Checking plan…";
  const compactPlanLabel = planState === "ready" && planId ? planId : planState === "error" ? "?" : "…";

  useEffect(() => {
    if (!user?._id) return;
    let active = true;
    const loadPlan = () => {
      void axiosInstance.get<SubscriptionSnapshot>("/subscriptions/me")
        .then((response) => {
          if (!active) return;
          setPlanId(response.data.effectivePlanId);
          setPlanState("ready");
        })
        .catch(() => { if (active) setPlanState("error"); });
    };
    loadPlan();
    window.addEventListener(SUBSCRIPTION_UPDATED_EVENT, loadPlan);
    return () => {
      active = false;
      window.removeEventListener(SUBSCRIPTION_UPDATED_EVENT, loadPlan);
    };
  }, [pathname, user?._id]);

  function toggleNavigation() {
    setHoverExpanded(false);
    if (isWatch) setExpandedOnWatch((current) => !current);
    else setCollapsedElsewhere((current) => !current);
  }

  const updateFocusMode = useCallback((enabled: boolean) => {
    setFocusMode(enabled);
    if (enabled) setHoverExpanded(false);
  }, []);

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

  const navigationProps = {
    pathname,
    pinnedCompact,
    planLabel,
    compactPlanLabel,
    onToggleCompact: toggleNavigation,
    onCreateChannel: () => { setMobileOpen(false); setChannelOpen(true); },
    onSignOut: () => { void handleSignOut(); },
    signingOut,
    signOutError,
  };

  return (
    <WorkspaceLayoutContext.Provider value={{ setFocusMode: updateFocusMode }}>
      <div className="min-h-screen bg-[#f7f8fb] text-[#172033] transition-colors dark:bg-[#101624] dark:text-[#edf1f7] [font-family:'Avenir_Next',Avenir,'Segoe_UI',ui-sans-serif,system-ui,sans-serif]">
        {!focusMode && (
          <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col overflow-x-hidden overflow-y-auto border-r border-[#e9ecf2] bg-white py-6 transition-[width,box-shadow,background-color] duration-200 dark:border-[#293247] dark:bg-[#151c2c] md:flex ${compact ? "w-[76px] px-3" : "w-[252px] px-4"} ${pinnedCompact && hoverExpanded ? "shadow-[14px_0_34px_rgba(24,33,55,0.1)]" : ""}`} aria-label="Workspace navigation" onMouseEnter={() => { if (pinnedCompact) setHoverExpanded(true); }} onMouseLeave={() => setHoverExpanded(false)}>
            <NavigationContent {...navigationProps} compact={compact} mobile={false} onNavigate={() => {}} />
          </aside>
        )}

        <button type="button" className="fixed left-4 top-4 z-30 flex size-11 items-center justify-center rounded-xl border border-[#e9ecf2] bg-white text-[#586377] shadow-[0_8px_24px_rgba(24,33,55,0.1)] focus-visible:outline-2 focus-visible:outline-[#ed6049] dark:border-[#39445b] dark:bg-[#202a40] dark:text-[#dce3ee] md:hidden" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu className="size-5" aria-hidden="true" /></button>

        {mobileOpen && (
          <>
            <button type="button" aria-label="Close navigation" className="fixed inset-0 z-40 bg-[#101729]/55 md:hidden" onClick={() => setMobileOpen(false)} />
            <aside className="fixed inset-y-0 left-0 z-50 flex w-[252px] max-w-[85vw] flex-col overflow-y-auto border-r border-[#e9ecf2] bg-white px-4 py-6 dark:border-[#293247] dark:bg-[#151c2c] md:hidden" aria-label="Mobile workspace navigation">
              <NavigationContent {...navigationProps} compact={false} pinnedCompact={false} mobile onNavigate={() => setMobileOpen(false)} />
            </aside>
          </>
        )}

        <div className={`min-w-0 pt-14 transition-[padding] duration-200 md:pt-0 ${focusMode ? "" : pinnedCompact ? "md:pl-[76px]" : "md:pl-[252px]"}`}>
          {children}
        </div>

        <ChannelDialogue isopen={channelOpen} onclose={() => setChannelOpen(false)} mode="create" />
      </div>
    </WorkspaceLayoutContext.Provider>
  );
}
