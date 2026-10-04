import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  Check,
  Clock3,
  Laptop,
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
import { useUser } from "@/lib/AuthContext";
import { getLocalTestLocation, saveLocalTestLocation } from "@/lib/security-context";
import styles from "./security.module.css";

type ClientContext = {
  ip: string;
  browser: string;
  browserVersion: string;
  os: string;
  deviceType: string;
  deviceModel: string;
  testCity: string;
  testState: string;
  city: string;
  state: string;
  country: string;
  approximateLocation: string;
};

type Session = ClientContext & { id: string; current: boolean; createdAt: string; lastSeenAt: string; expiresAt: string };
type TrustedDevice = ClientContext & { id: string; current: boolean; verifiedAt: string; lastUsedAt: string; expiresAt: string };
type Attempt = ClientContext & { id: string; eventType: string; outcome: string; successful: boolean; occurredAt: string };
type ThemePreference = "automatic" | "light" | "dark";
type SecurityOverview = { sessions: Session[]; trustedDevices: TrustedDevice[]; attempts: Attempt[]; themePreference: ThemePreference; restrictDownloadsToTrustedDevices: boolean; note: string };

const outcomeLabels: Record<string, string> = {
  signed_in: "Password accepted",
  invalid_credentials: "Incorrect credentials",
  otp_required: "OTP requested",
  otp_delivery_failed: "OTP delivery unavailable",
  otp_failed: "Incorrect OTP",
  otp_verified: "OTP verified",
  otp_expired: "OTP expired",
};

const themeOptions = [
  { value: "automatic", label: "Automatic", detail: "Follows the IST schedule", icon: Clock3 },
  { value: "light", label: "Light", detail: "Always light", icon: Sun },
  { value: "dark", label: "Dark", detail: "Always dark", icon: Moon },
] as const;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short",
  }).format(date);
}

function contextTitle(context: ClientContext) {
  const browser = context.browser || "Unknown browser";
  const device = context.deviceModel || context.deviceType || "Unknown device";
  return `${browser}${context.browserVersion ? ` ${context.browserVersion}` : ""} on ${device}`;
}

function contextLocation(context: ClientContext) {
  const automatic = [context.city, context.state, context.country].filter(Boolean).join(", ");
  if (automatic) return `${automatic}${context.approximateLocation ? ` · approx. ${context.approximateLocation}` : ""}`;
  const location = [context.testCity, context.testState].filter(Boolean).join(", ");
  return location ? `${location} · test location` : "Location unavailable";
}

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.message === "string"
    ? error.response.data.message : fallback;
}

function DeviceIcon({ type }: { type: string }) {
  return /phone|tablet/i.test(type)
    ? <Smartphone aria-hidden="true" /> : <Laptop aria-hidden="true" />;
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

  const loadSecurity = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await axiosInstance.get<SecurityOverview>("/user/security");
      setOverview(response.data);
    } catch (caught) {
      setError(errorMessage(caught, "Could not load account security."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = getLocalTestLocation();
    setTestCity(saved.testCity);
    setTestState(saved.testState);
    void loadSecurity();
  }, [loadSecurity]);

  async function revokeSession(session: Session) {
    setBusyId(session.id);
    setError("");
    setNotice("");
    try {
      const response = await axiosInstance.delete<{ current: boolean }>(`/user/security/sessions/${session.id}`);
      if (response.data.current) {
        login(null);
        void router.replace("/sign-in");
        return;
      }
      setOverview((current) => current ? {
        ...current, sessions: current.sessions.filter((item) => item.id !== session.id),
      } : current);
      setNotice("Session revoked.");
    } catch (caught) {
      setError(errorMessage(caught, "Could not revoke that session."));
    } finally {
      setBusyId("");
    }
  }

  async function revokeOthers() {
    setBusyId("others");
    setError("");
    setNotice("");
    try {
      const response = await axiosInstance.delete<{ revoked: number }>("/user/security/sessions/others");
      setOverview((current) => current ? {
        ...current, sessions: current.sessions.filter((item) => item.current),
      } : current);
      setNotice(`${response.data.revoked} other session${response.data.revoked === 1 ? "" : "s"} revoked.`);
    } catch (caught) {
      setError(errorMessage(caught, "Could not revoke the other sessions."));
    } finally {
      setBusyId("");
    }
  }

  async function removeTrustedDevice(device: TrustedDevice) {
    setBusyId(device.id);
    setError("");
    setNotice("");
    try {
      await axiosInstance.delete(`/user/security/trusted-devices/${device.id}`);
      setOverview((current) => current ? {
        ...current, trustedDevices: current.trustedDevices.filter((item) => item.id !== device.id),
      } : current);
      setNotice("Trusted browser removed. Its next sign-in will require OTP.");
    } catch (caught) {
      setError(errorMessage(caught, "Could not remove that trusted browser."));
    } finally {
      setBusyId("");
    }
  }

  async function chooseTheme(preference: ThemePreference) {
    setBusyId(`theme-${preference}`);
    setError("");
    setNotice("");
    try {
      await updateThemePreference(preference);
      setNotice(preference === "automatic" ? "Automatic IST theme restored." : `${preference === "light" ? "Light" : "Dark"} theme saved for this account.`);
    } catch (caught) {
      setError(errorMessage(caught, "Could not save the theme."));
    } finally {
      setBusyId("");
    }
  }

  async function chooseDownloadSecurity(enabled: boolean) {
    setBusyId("download-security");
    setError("");
    setNotice("");
    try {
      const response = await axiosInstance.patch<{ restrictDownloadsToTrustedDevices: boolean }>(
        "/user/preferences/download-security", { restrictDownloadsToTrustedDevices: enabled });
      setOverview((current) => current ? { ...current,
        restrictDownloadsToTrustedDevices: response.data.restrictDownloadsToTrustedDevices } : current);
      setNotice(enabled ? "Downloads now require a trusted browser." : "Downloads are allowed from any signed-in browser, subject to your plan quotas.");
    } catch (caught) {
      setError(errorMessage(caught, "Could not save download security."));
    } finally {
      setBusyId("");
    }
  }

  function saveTestLocation() {
    saveLocalTestLocation(testCity, testState);
    setError("");
    setNotice("Test location saved in this browser. A change will require OTP at the next sign-in.");
  }

  return (
    <main className={`yt-page ${styles.page}`}>
      <div className="yt-page-header">
        <div>
          <h1 className="yt-page-title">Security and appearance</h1>
          <p className="yt-page-description">Manage where you are signed in and how YourTube looks.</p>
        </div>
        <button type="button" className="yt-pill-button" disabled={loading || Boolean(busyId)} onClick={() => void loadSecurity()}>
          <RefreshCw aria-hidden="true" className={loading ? styles.spin : undefined} />Refresh
        </button>
      </div>

      <section className={styles.summary} aria-label="Account security overview">
        <div className={styles.summaryIntro}>
          <span className={styles.summaryIcon}><ShieldCheck aria-hidden="true" /></span>
          <div><h2>Keep your account yours</h2><p>Review the devices and browsers that can access your videos.</p></div>
        </div>
        <div className={styles.summaryStats}>
          <div><strong>{overview?.sessions.length ?? "—"}</strong><span>Active sessions</span></div>
          <div><strong>{overview?.trustedDevices.length ?? "—"}</strong><span>Trusted browsers</span></div>
        </div>
      </section>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {!error && notice && <p className={styles.notice} role="status">{notice}</p>}

      {loading && !overview ? (
        <div className={styles.loading}><LoaderCircle className={styles.spin} aria-hidden="true" />Loading security history…</div>
      ) : !overview ? (
        <div className={styles.loading}><p>Security details are unavailable right now.</p><button type="button" className="yt-pill-button" onClick={() => void loadSecurity()}>Try again</button></div>
      ) : (
        <div className={styles.sections}>
          <section className={styles.card} aria-labelledby="sessions-heading">
            <div className={styles.cardHeading}>
              <div><h2 id="sessions-heading"><ShieldCheck aria-hidden="true" />Active sessions</h2><p>Signing out of this session will take you to the sign-in page.</p></div>
              {overview.sessions.length > 1 && <button type="button" className={styles.action} disabled={Boolean(busyId)} onClick={() => void revokeOthers()}>
                {busyId === "others" ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <Trash2 aria-hidden="true" />}Sign out other sessions
              </button>}
            </div>
            {overview.sessions.length === 0 ? <p className={styles.empty}>No active sessions were found.</p> : (
              <div className={styles.sessionList}>{overview.sessions.map((session) => <div key={session.id} className={styles.sessionRow}>
                <span className={styles.deviceIcon}><DeviceIcon type={session.deviceType} /></span>
                <div className={styles.sessionDetails}>
                  <div className={styles.deviceTitle}><strong>{contextTitle(session)}</strong>{session.current && <span className={styles.current}>This device</span>}</div>
                  <p>{contextLocation(session)} · IP {session.ip || "unavailable"}</p>
                  <small>Last active {formatDate(session.lastSeenAt)} · expires {formatDate(session.expiresAt)}</small>
                </div>
                <button type="button" className={styles.dangerAction} aria-label={session.current ? "Sign out of this device" : `Revoke session: ${contextTitle(session)}`} disabled={Boolean(busyId)} onClick={() => void revokeSession(session)}>
                  {busyId === session.id ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <Trash2 aria-hidden="true" />}{session.current ? "Sign out here" : "Revoke"}
                </button>
              </div>)}</div>
            )}
          </section>

          <div className={styles.columns}>
            <section className={styles.card} aria-labelledby="trusted-heading">
              <div className={styles.cardHeading}><div><h2 id="trusted-heading"><ShieldCheck aria-hidden="true" />Trusted browsers</h2><p>Trusted browsers skip OTP until the browser, IP, or test location changes.</p></div></div>
              <div className={styles.trustedList}>{overview.trustedDevices.length ? overview.trustedDevices.map((device) => <div key={device.id} className={styles.trustedRow}>
                <span className={styles.deviceIcon}><DeviceIcon type={device.deviceType} /></span>
                <div className={styles.trustedDetails}>
                  <div className={styles.deviceTitle}><strong>{contextTitle(device)}</strong>{device.current && <span className={styles.current}>This browser</span>}</div>
                  <p>{contextLocation(device)}</p><small>Last used {formatDate(device.lastUsedAt)} · expires {formatDate(device.expiresAt)}</small>
                </div>
                <button type="button" className={styles.iconAction} title="Remove trusted browser" aria-label={`Remove trusted browser: ${contextTitle(device)}, last used ${formatDate(device.lastUsedAt)}`} disabled={Boolean(busyId)} onClick={() => void removeTrustedDevice(device)}>
                  {busyId === device.id ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                </button>
              </div>) : <p className={styles.empty}>No trusted browsers remain.</p>}</div>
              <label className="mt-5 flex cursor-pointer items-start gap-3 border-t border-[var(--yt-border)] pt-4 text-sm">
                <input type="checkbox" className="mt-1 accent-[var(--yt-red)]" checked={overview.restrictDownloadsToTrustedDevices} disabled={Boolean(busyId)} onChange={(event) => void chooseDownloadSecurity(event.target.checked)} />
                <span><strong className="block">Require a trusted browser for downloads</strong><small className="mt-1 block text-[var(--yt-muted)]">When enabled, each download must come from a browser verified with a sign-in code. Daily and monthly limits still apply.</small></span>
              </label>
            </section>

            <section className={styles.card} aria-labelledby="location-heading">
              <div className={styles.cardHeading}><div><h2 id="location-heading"><MapPin aria-hidden="true" />Local test location</h2><p>These city and state values simulate a location change on localhost. They are user supplied, not geolocation.</p></div></div>
              <div className={styles.locationFields}>
                <label>Test city<input value={testCity} onChange={(event) => setTestCity(event.target.value)} maxLength={80} placeholder="e.g. Pune" /></label>
                <label>Test state<input value={testState} onChange={(event) => setTestState(event.target.value)} maxLength={80} placeholder="e.g. Maharashtra" /></label>
              </div>
              <button type="button" className={styles.action} onClick={saveTestLocation}><Check aria-hidden="true" />Save in this browser</button>
              <p className={styles.help}>Changing these values affects verification on your next sign-in.</p>
            </section>
          </div>

          <section className={styles.card} aria-labelledby="appearance-heading">
            <div className={styles.cardHeading}><div><h2 id="appearance-heading"><Sun aria-hidden="true" />Appearance</h2><p>Automatic uses light from 5:00 AM until noon IST and dark outside that window. Your choice is saved to your account.</p></div></div>
            <div className={styles.themeOptions}>{themeOptions.map(({ value, label, detail, icon: Icon }) => <button key={value} type="button" className={styles.themeOption} data-selected={themePreference === value} aria-pressed={themePreference === value} disabled={Boolean(busyId)} onClick={() => void chooseTheme(value)}>
              <span className={styles.themeIcon}>{busyId === `theme-${value}` ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <Icon aria-hidden="true" />}</span>
              <span><strong>{label}</strong><small>{themePreference === value ? `Selected · ${resolvedTheme}` : detail}</small></span>
              {themePreference === value && <Check className={styles.themeCheck} aria-hidden="true" />}
            </button>)}</div>
          </section>

          <section className={styles.card} aria-labelledby="activity-heading">
            <div className={styles.cardHeading}><div><h2 id="activity-heading"><Clock3 aria-hidden="true" />Recent sign-in activity</h2><p>Password and OTP events for this account, newest first. Times are shown in IST.</p></div></div>
            {overview.attempts.length === 0 ? <p className={styles.empty}>No sign-in activity recorded yet.</p> : <div className={styles.tableScroll}><table className={styles.activityTable}>
              <thead><tr><th>Result</th><th>Browser and device</th><th>Approximate location</th><th>When</th></tr></thead>
              <tbody>{overview.attempts.map((attempt) => <tr key={attempt.id}>
                <td><span className={styles.outcome} data-result={attempt.successful ? "success" : attempt.outcome === "otp_required" ? "pending" : "failed"}>{outcomeLabels[attempt.outcome] || attempt.outcome}</span></td>
                <td><strong>{contextTitle(attempt)}</strong><small>{attempt.os || "Unknown OS"} · IP {attempt.ip || "unavailable"}</small></td>
                <td>{contextLocation(attempt)}</td>
                <td>{formatDate(attempt.occurredAt)}</td>
              </tr>)}</tbody>
            </table></div>}
            <p className={styles.help}>{overview.note}</p>
          </section>
        </div>
      )}
    </main>
  );
}
