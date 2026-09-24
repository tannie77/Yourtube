"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Clock3,
  Laptop,
  Lightbulb,
  LoaderCircle,
  MapPin,
  Moon,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
} from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContent";
import { getLocalTestLocation, saveLocalTestLocation } from "@/lib/security-context";

type ClientContext = {
  ip: string;
  browser: string;
  browserVersion: string;
  os: string;
  deviceType: string;
  deviceModel: string;
  testCity: string;
  testState: string;
};

type Session = ClientContext & { id: string; current: boolean; createdAt: string; lastSeenAt: string; expiresAt: string };
type TrustedDevice = ClientContext & { id: string; current: boolean; verifiedAt: string; lastUsedAt: string; expiresAt: string };
type Attempt = ClientContext & { id: string; eventType: string; outcome: string; successful: boolean; occurredAt: string };
type SecurityOverview = { sessions: Session[]; trustedDevices: TrustedDevice[]; attempts: Attempt[]; themePreference: "automatic" | "light" | "dark"; note: string };

const outcomeLabels: Record<string, string> = {
  signed_in: "Password accepted",
  invalid_credentials: "Incorrect credentials",
  otp_required: "OTP requested",
  otp_delivery_failed: "OTP delivery unavailable",
  otp_failed: "Incorrect OTP",
  otp_verified: "OTP verified",
  otp_expired: "OTP expired",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function contextTitle(context: ClientContext) {
  return `${context.browser}${context.browserVersion ? ` ${context.browserVersion}` : ""} on ${context.deviceModel || context.deviceType}`;
}

function contextLocation(context: ClientContext) {
  const testLocation = [context.testCity, context.testState].filter(Boolean).join(", ");
  return testLocation ? `${testLocation} · user-supplied test location` : "No test location supplied";
}

function DeviceIcon({ type }: { type: string }) {
  return /phone|tablet/i.test(type) ? <Smartphone className="size-5" aria-hidden="true" /> : <Laptop className="size-5" aria-hidden="true" />;
}

export default function SecurityPage() {
  const router = useRouter();
  const { login, themePreference, resolvedTheme, updateThemePreference } = useUser();
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testCity, setTestCity] = useState("");
  const [testState, setTestState] = useState("");

  async function loadSecurity() {
    setError("");
    try {
      const response = await axiosInstance.get<SecurityOverview>("/user/security");
      setOverview(response.data);
    } catch (caught) {
      setError(axios.isAxiosError(caught) ? caught.response?.data?.message || "Could not load account security." : "Could not load account security.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = getLocalTestLocation();
      setTestCity(saved.testCity);
      setTestState(saved.testState);
      void loadSecurity();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function revokeSession(session: Session) {
    setBusyId(session.id);
    setError("");
    try {
      const response = await axiosInstance.delete(`/user/security/sessions/${session.id}`);
      if (response.data.current) {
        login(null);
        router.replace("/sign-in");
        return;
      }
      setOverview((current) => current ? { ...current, sessions: current.sessions.filter((item) => item.id !== session.id) } : current);
      setNotice("Session revoked.");
    } catch (caught) {
      setError(axios.isAxiosError(caught) ? caught.response?.data?.message || "Could not revoke that session." : "Could not revoke that session.");
    } finally {
      setBusyId("");
    }
  }

  async function revokeOthers() {
    setBusyId("others");
    setError("");
    try {
      const response = await axiosInstance.delete("/user/security/sessions/others");
      setOverview((current) => current ? { ...current, sessions: current.sessions.filter((item) => item.current) } : current);
      setNotice(`${response.data.revoked} other session${response.data.revoked === 1 ? "" : "s"} revoked.`);
    } catch (caught) {
      setError(axios.isAxiosError(caught) ? caught.response?.data?.message || "Could not revoke the other sessions." : "Could not revoke the other sessions.");
    } finally {
      setBusyId("");
    }
  }

  async function removeTrustedDevice(device: TrustedDevice) {
    setBusyId(device.id);
    setError("");
    try {
      await axiosInstance.delete(`/user/security/trusted-devices/${device.id}`);
      setOverview((current) => current ? { ...current, trustedDevices: current.trustedDevices.filter((item) => item.id !== device.id) } : current);
      setNotice("Trusted browser removed. Its next sign-in will require OTP.");
    } catch (caught) {
      setError(axios.isAxiosError(caught) ? caught.response?.data?.message || "Could not remove that trusted browser." : "Could not remove that trusted browser.");
    } finally {
      setBusyId("");
    }
  }

  async function chooseTheme(preference: "automatic" | "light" | "dark") {
    setBusyId(`theme-${preference}`);
    setError("");
    try {
      await updateThemePreference(preference);
      setNotice(preference === "automatic" ? "Automatic IST theme restored." : `${preference === "light" ? "Light" : "Dark"} theme saved for this account.`);
    } catch (caught) {
      setError(axios.isAxiosError(caught) ? caught.response?.data?.message || "Could not save the theme." : "Could not save the theme.");
    } finally {
      setBusyId("");
    }
  }

  function saveTestLocation() {
    saveLocalTestLocation(testCity, testState);
    setNotice("Local test location saved in this browser. A changed value will require OTP at the next sign-in.");
  }

  const card = "rounded-[24px] border border-[#e7eaf0] bg-white p-5 shadow-[0_14px_40px_rgba(33,42,66,0.05)] dark:border-[#293247] dark:bg-[#182033] dark:shadow-none";
  const secondaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#dfe3ea] bg-white px-4 text-sm font-semibold text-[#475267] transition hover:border-[#c8ced8] hover:bg-[#f7f8fa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ed6049] disabled:opacity-50 dark:border-[#39445b] dark:bg-[#202a40] dark:text-[#dce3ee] dark:hover:bg-[#28344d]";

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-5 py-8 text-[#172033] transition-colors dark:bg-[#101624] dark:text-[#edf1f7] sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1120px]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d95c44]">Account</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Security & appearance</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#687387] dark:text-[#aab5c8]">Review local sessions and trusted browsers, inspect sign-in activity, and choose how VidCircle looks.</p></div>
          <button type="button" onClick={() => { setLoading(true); void loadSecurity(); }} disabled={loading} className={secondaryButton}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />Refresh</button>
        </div>

        {(error || notice) && <div className={`mt-6 rounded-2xl px-4 py-3 text-sm ${error ? "bg-[#fff0ed] text-[#a53828] dark:bg-[#4a2424] dark:text-[#ffc1b7]" : "bg-[#edf8f1] text-[#286244] dark:bg-[#19392c] dark:text-[#b7efd0]"}`} role={error ? "alert" : "status"}>{error || notice}</div>}

        {loading && !overview ? <div className="flex min-h-[360px] items-center justify-center text-sm text-[#778195] dark:text-[#aab5c8]"><LoaderCircle className="mr-2 size-5 animate-spin" aria-hidden="true" />Loading security history…</div> : overview && (
          <div className="mt-7 grid gap-6">
            <section className={card}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="size-5 text-[#4d8d69]" aria-hidden="true" />Active sessions</h2><p className="mt-1 text-sm text-[#737d8e] dark:text-[#aab5c8]">Revoking your current session signs this browser out immediately.</p></div>{overview.sessions.length > 1 && <button type="button" disabled={busyId === "others"} onClick={() => void revokeOthers()} className={secondaryButton}>{busyId === "others" ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}Sign out other sessions</button>}</div>
              <div className="mt-5 divide-y divide-[#edf0f4] dark:divide-[#303a50]">{overview.sessions.map((session) => <div key={session.id} className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 gap-3"><span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f0f3f7] text-[#59667a] dark:bg-[#263149] dark:text-[#b8c4d7]"><DeviceIcon type={session.deviceType} /></span><div className="min-w-0"><p className="font-semibold">{contextTitle(session)} {session.current && <span className="ml-2 rounded-full bg-[#eaf7ef] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#367555] dark:bg-[#204230] dark:text-[#9ce2ba]">Current</span>}</p><p className="mt-1 text-xs text-[#737d8e] dark:text-[#aab5c8]">{contextLocation(session)} · IP {session.ip || "Unavailable"}</p><p className="mt-1 text-xs text-[#939bab] dark:text-[#7f8ca3]">Last active {formatDate(session.lastSeenAt)} · expires {formatDate(session.expiresAt)}</p></div></div><button type="button" disabled={busyId === session.id} onClick={() => void revokeSession(session)} className={secondaryButton}>{busyId === session.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}{session.current ? "Sign out here" : "Revoke"}</button></div>)}</div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className={card}>
                <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="size-5 text-[#4d8d69]" aria-hidden="true" />Trusted browsers</h2><p className="mt-1 text-sm text-[#737d8e] dark:text-[#aab5c8]">A trusted context can sign in without OTP until it expires or its browser, IP, or test location changes.</p>
                <div className="mt-5 space-y-3">{overview.trustedDevices.length ? overview.trustedDevices.map((device) => <div key={device.id} className="rounded-2xl border border-[#edf0f4] p-4 dark:border-[#303a50]"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{contextTitle(device)}</p><p className="mt-1 text-xs leading-5 text-[#737d8e] dark:text-[#aab5c8]">{contextLocation(device)}<br />Last used {formatDate(device.lastUsedAt)}</p></div><button type="button" title="Remove trusted browser" aria-label={`Remove ${contextTitle(device)}`} disabled={busyId === device.id} onClick={() => void removeTrustedDevice(device)} className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[#9a4b42] transition hover:bg-[#fff0ed] dark:text-[#ffaaa0] dark:hover:bg-[#4a2424]">{busyId === device.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</button></div></div>) : <p className="rounded-2xl bg-[#f7f8fa] p-4 text-sm text-[#737d8e] dark:bg-[#202a40] dark:text-[#aab5c8]">No trusted browsers remain.</p>}</div>
              </section>

              <section className={card}>
                <h2 className="flex items-center gap-2 text-lg font-semibold"><MapPin className="size-5 text-[#d95c44]" aria-hidden="true" />Local test location</h2><p className="mt-1 text-sm text-[#737d8e] dark:text-[#aab5c8]">These values simulate a city/state change on localhost. They are not geolocation.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2"><div><label htmlFor="security-city" className="text-xs font-semibold">Test city</label><input id="security-city" value={testCity} onChange={(event) => setTestCity(event.target.value)} maxLength={80} className="mt-1 h-11 w-full rounded-xl border border-[#dfe3ea] bg-white px-3 text-sm outline-none focus:border-[#ed6049] dark:border-[#39445b] dark:bg-[#202a40]" /></div><div><label htmlFor="security-state" className="text-xs font-semibold">Test state</label><input id="security-state" value={testState} onChange={(event) => setTestState(event.target.value)} maxLength={80} className="mt-1 h-11 w-full rounded-xl border border-[#dfe3ea] bg-white px-3 text-sm outline-none focus:border-[#ed6049] dark:border-[#39445b] dark:bg-[#202a40]" /></div></div>
                <button type="button" onClick={saveTestLocation} className={`${secondaryButton} mt-4`}><Check className="size-4" />Save in this browser</button>
              </section>
            </div>

            <section className={card}>
              <h2 className="flex items-center gap-2 text-lg font-semibold"><Lightbulb className="size-5 text-[#d28a31]" aria-hidden="true" />Appearance</h2><p className="mt-1 text-sm text-[#737d8e] dark:text-[#aab5c8]">Automatic uses light from 5:00 AM until noon IST and dark outside that window. A manual choice persists with your account.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">{([
                ["automatic", Clock3, "Automatic IST"],
                ["light", Sun, "Light"],
                ["dark", Moon, "Dark"],
              ] as const).map(([preference, Icon, label]) => <button key={preference} type="button" disabled={busyId.startsWith("theme-")} onClick={() => void chooseTheme(preference)} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ed6049] ${themePreference === preference ? "border-[#ed6049] bg-[#fff2ee] text-[#a84432] dark:bg-[#4a2a28] dark:text-[#ffb5a7]" : "border-[#e3e7ed] hover:bg-[#f7f8fa] dark:border-[#39445b] dark:hover:bg-[#202a40]"}`}><span className="flex size-10 items-center justify-center rounded-xl bg-white/70 dark:bg-[#263149]"><Icon className="size-5" /></span><span><span className="block text-sm font-semibold">{label}</span><span className="mt-0.5 block text-xs opacity-70">{themePreference === preference ? `Active · ${resolvedTheme}` : "Choose"}</span></span></button>)}</div>
            </section>

            <section className={card}>
              <h2 className="text-lg font-semibold">Recent sign-in activity</h2><p className="mt-1 text-sm text-[#737d8e] dark:text-[#aab5c8]">Password and OTP events for this account, newest first.</p>
              <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-[#e8ebf0] text-xs uppercase tracking-wide text-[#8992a2] dark:border-[#303a50]"><tr><th className="px-3 py-3 font-semibold">Result</th><th className="px-3 py-3 font-semibold">Context</th><th className="px-3 py-3 font-semibold">Test location</th><th className="px-3 py-3 font-semibold">When</th></tr></thead><tbody className="divide-y divide-[#edf0f4] dark:divide-[#303a50]">{overview.attempts.map((attempt) => <tr key={attempt.id}><td className="px-3 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${attempt.successful ? "bg-[#eaf7ef] text-[#367555] dark:bg-[#204230] dark:text-[#9ce2ba]" : "bg-[#fff0ed] text-[#a84432] dark:bg-[#4a2424] dark:text-[#ffaaa0]"}`}>{outcomeLabels[attempt.outcome] || attempt.outcome}</span></td><td className="px-3 py-3"><span className="font-medium">{contextTitle(attempt)}</span><span className="mt-0.5 block text-xs text-[#8992a2]">{attempt.os} · {attempt.ip || "IP unavailable"}</span></td><td className="px-3 py-3 text-[#667084] dark:text-[#aab5c8]">{[attempt.testCity, attempt.testState].filter(Boolean).join(", ") || "Not supplied"}</td><td className="px-3 py-3 text-[#667084] dark:text-[#aab5c8]">{formatDate(attempt.occurredAt)}</td></tr>)}</tbody></table>{overview.attempts.length === 0 && <p className="py-8 text-center text-sm text-[#8992a2]">No sign-in activity recorded yet.</p>}</div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
