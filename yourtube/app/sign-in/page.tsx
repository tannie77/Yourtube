"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  MapPin,
  Play,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useUser } from "@/lib/AuthContent";
import { getLocalTestLocation, saveLocalTestLocation } from "@/lib/security-context";
import styles from "./sign-in.module.css";

type Mode = "sign-in" | "register";
type OtpChallenge = { challengeToken: string; expiresAt: string; destination: string; message: string };

export default function SignInPage() {
  const router = useRouter();
  const { user, loading, signIn, verifyOtp, register } = useUser();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [testCity, setTestCity] = useState("");
  const [testState, setTestState] = useState("");
  const [otpChallenge, setOtpChallenge] = useState<OtpChallenge | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isRegistering = mode === "register";

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, router, user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = getLocalTestLocation();
      setTestCity(saved.testCity);
      setTestState(saved.testState);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (otpChallenge) {
        await verifyOtp(otpChallenge.challengeToken, otpCode);
        router.replace("/dashboard");
        return;
      }

      const securityContext = { testCity: testCity.trim(), testState: testState.trim() };
      saveLocalTestLocation(testCity, testState);
      if (isRegistering) await register(name, email, password, securityContext);
      else {
        const result = await signIn(email, password, securityContext);
        if (result.otpRequired) {
          setOtpChallenge(result);
          setOtpCode("");
          return;
        }
      }
      router.replace("/dashboard");
    } catch (caught) {
      const message = axios.isAxiosError(caught) ? caught.response?.data?.message : null;
      setError(message || "Could not connect to the local server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function changeMode() {
    setMode(isRegistering ? "sign-in" : "register");
    setPassword("");
    setShowPassword(false);
    setOtpChallenge(null);
    setOtpCode("");
    setError("");
  }

  function restartSignIn() {
    setOtpChallenge(null);
    setOtpCode("");
    setPassword("");
    setError("");
  }

  const fieldClass = "h-13 w-full rounded-2xl border border-[#d9dde5] bg-white pl-12 pr-4 text-[15px] text-[#171b2a] outline-none transition placeholder:text-[#9ca3af] hover:border-[#b7beca] focus-visible:border-[#e65b45] focus-visible:ring-4 focus-visible:ring-[#e65b45]/10";

  return (
    <main className={`${styles.authPage} min-h-screen lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`}>
      <section className="flex min-h-screen flex-col bg-[#faf9f7] px-6 py-6 sm:px-10 lg:px-12 lg:py-7 xl:px-20">
        <div className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-3" aria-label="VidCircle">
            <span className="flex size-10 items-center justify-center rounded-[13px] bg-[#ed6049] text-white shadow-[0_8px_18px_rgba(237,96,73,0.24)]">
              <Play className="ml-0.5 size-5 fill-current" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="text-[22px] font-bold tracking-[-0.06em] text-[#171b2a]">VidCircle<span className="text-[#ed6049]">.</span></span>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-8 sm:py-10 lg:py-6">
          <div className="w-full max-w-[440px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#f5ddd6] bg-[#fff1ec] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-[#c45a42]">
              <span className="size-1.5 rounded-full bg-[#ed6049]" />
              Your space for what&apos;s next
            </span>

            <h1 className="mt-5 text-[clamp(2.7rem,4.5vw,3.6rem)] leading-[1.04] font-semibold tracking-[-0.065em] text-[#171b2a]">
              {otpChallenge ? <>Check your<br />local inbox.</> : isRegistering ? <>Make room<br />for more.</> : <>Welcome<br />back.</>}
            </h1>
            <p className="mt-3 max-w-[360px] text-[15px] leading-7 text-[#687181]">
              {otpChallenge
                ? `Enter the six-digit code captured for ${otpChallenge.destination} in Mailpit.`
                : isRegistering
                ? "Create your local account and start making this space your own."
                : "Sign in to pick up where you left off, from the videos you love to the people you follow."}
            </p>

            <form onSubmit={submit} className="mt-7 space-y-4">
              {!otpChallenge && isRegistering && (
                <div>
                  <label htmlFor="name" className="mb-2 block text-sm font-semibold text-[#242938]">Your name</label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-[#9aa2af]" aria-hidden="true" />
                    <input id="name" name="name" type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="What should we call you?" className={fieldClass} required />
                  </div>
                </div>
              )}

              {!otpChallenge && <div>
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-[#242938]">Email address</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-[#9aa2af]" aria-hidden="true" />
                  <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className={fieldClass} aria-invalid={Boolean(error)} aria-describedby={error ? "auth-error" : undefined} required />
                </div>
              </div>}

              {!otpChallenge && <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="password" className="text-sm font-semibold text-[#242938]">Password</label>
                  {isRegistering && <span className="text-xs text-[#8a92a0]">At least 8 characters</span>}
                </div>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-[#9aa2af]" aria-hidden="true" />
                  <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={isRegistering ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={isRegistering ? 8 : undefined} placeholder={isRegistering ? "Create a password" : "Enter your password"} className={`${fieldClass} pr-12`} aria-invalid={Boolean(error)} aria-describedby={error ? "auth-error" : undefined} required />
                  <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute top-1/2 right-4 flex size-6 -translate-y-1/2 items-center justify-center rounded text-[#818a99] transition hover:text-[#242938] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e65b45]" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
                    {showPassword ? <EyeOff className="size-[18px]" aria-hidden="true" /> : <Eye className="size-[18px]" aria-hidden="true" />}
                  </button>
                </div>
              </div>}

              {!otpChallenge && (
                <fieldset className="rounded-2xl border border-[#e2e5ea] bg-[#f7f8fa] p-4">
                  <legend className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-[#6f7888]">Local test location</legend>
                  <p className="mb-3 flex items-start gap-2 text-xs leading-5 text-[#7a8391]">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    Optional demo values only. Changing either value on a later sign-in triggers local OTP verification.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><label htmlFor="test-city" className="mb-1.5 block text-xs font-semibold text-[#424958]">Test city</label><input id="test-city" value={testCity} onChange={(event) => setTestCity(event.target.value)} maxLength={80} placeholder="e.g. Pune" className="h-10 w-full rounded-xl border border-[#d9dde5] bg-white px-3 text-sm text-[#171b2a] outline-none focus-visible:border-[#e65b45] focus-visible:ring-3 focus-visible:ring-[#e65b45]/10" /></div>
                    <div><label htmlFor="test-state" className="mb-1.5 block text-xs font-semibold text-[#424958]">Test state</label><input id="test-state" value={testState} onChange={(event) => setTestState(event.target.value)} maxLength={80} placeholder="e.g. Maharashtra" className="h-10 w-full rounded-xl border border-[#d9dde5] bg-white px-3 text-sm text-[#171b2a] outline-none focus-visible:border-[#e65b45] focus-visible:ring-3 focus-visible:ring-[#e65b45]/10" /></div>
                  </div>
                </fieldset>
              )}

              {otpChallenge && (
                <div>
                  <label htmlFor="otp-code" className="mb-2 block text-sm font-semibold text-[#242938]">One-time code</label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-[#9aa2af]" aria-hidden="true" />
                    <input id="otp-code" name="otp-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className={`${fieldClass} font-mono tracking-[0.35em]`} aria-invalid={Boolean(error)} aria-describedby={error ? "auth-error" : "otp-help"} required autoFocus />
                  </div>
                  <p id="otp-help" className="mt-2 flex items-start gap-2 text-xs leading-5 text-[#7a8391]"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[#4e8b69]" aria-hidden="true" />The code expires in ten minutes and is available only in the local Mailpit inbox.</p>
                </div>
              )}

              {error && (
                <p id="auth-error" role="alert" className="flex items-start gap-2 rounded-xl bg-[#fff0ed] px-4 py-3 text-sm leading-5 text-[#a53828]">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}

              <button type="submit" disabled={submitting || loading} className="group mt-1 flex h-13 w-full items-center justify-center gap-3 rounded-2xl bg-[#ed6049] px-5 text-[15px] font-semibold text-white shadow-[0_12px_25px_rgba(237,96,73,0.22)] transition hover:-translate-y-0.5 hover:bg-[#dc523c] hover:shadow-[0_16px_28px_rgba(237,96,73,0.26)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#e65b45] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0">
                {submitting ? "Please wait…" : loading ? "Checking session…" : otpChallenge ? "Verify and sign in" : isRegistering ? "Create your account" : "Sign in to VidCircle"}
                {!submitting && !loading && <ArrowRight className="size-[18px] transition group-hover:translate-x-0.5" aria-hidden="true" />}
              </button>
            </form>

            {otpChallenge ? (
              <p className="mt-6 text-center text-sm text-[#697383]">Not this sign-in? <button type="button" onClick={restartSignIn} className="font-semibold text-[#db5b45] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#e65b45]">Start again</button></p>
            ) : <p className="mt-6 text-center text-sm text-[#697383]">
              {isRegistering ? "Already have an account?" : "New to VidCircle?"}{" "}
              <button type="button" onClick={changeMode} className="font-semibold text-[#db5b45] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#e65b45]">
                {isRegistering ? "Sign in" : "Create an account"}
              </button>
            </p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-[#9aa2ad]">
          <span>© {new Date().getFullYear()} VidCircle</span>
          <span>Local prototype · No external sign-in</span>
        </div>
      </section>

      <aside className={`${styles.showcase} relative hidden min-h-screen flex-col overflow-hidden px-12 py-7 text-white lg:flex xl:px-16`}>
        <div className={styles.showcaseGlow} aria-hidden="true" />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/55">Watch · Create · Connect</span>
          <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/75">Local preview</span>
        </div>

        <div className="relative z-10 flex flex-1 flex-col justify-center py-12">
          <h2 className="max-w-[540px] text-[clamp(2.6rem,4vw,4.5rem)] leading-[1.04] font-semibold tracking-[-0.065em]">
            A new way to <span className="text-[#ffad90]">stay in the story.</span>
          </h2>
          <p className="mt-4 max-w-[390px] text-[15px] leading-7 text-[#c3c8d9]">
            One place for the videos you love, the conversations they start, and the people you share them with.
          </p>

          <div className={styles.artwork} aria-hidden="true">
            <div className={styles.orbit} />
            <div className={styles.videoCard}>
              <div className={styles.videoScene}>
                <div className={styles.sun} />
                <div className={styles.hillBack} />
                <div className={styles.hillFront} />
                <div className={styles.sceneLabel}>THE NEXT CHAPTER</div>
                <div className={styles.playButton}><Play className="ml-1 size-7 fill-current" strokeWidth={1.5} /></div>
              </div>
              <div className={styles.videoBar}>
                <span className={styles.videoBarTrack}><span /></span>
                <span className={styles.videoBarTime}>02:18 / 08:42</span>
              </div>
            </div>
            <div className={styles.commentCard}>
              <span className={styles.commentAvatar}>A</span>
              <span><strong>Good stories bring us together.</strong><small>Join the conversation</small></span>
              <span className={styles.commentHeart}>♥</span>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs tracking-wide text-white/45">Your corner of the internet, made more human.</p>
      </aside>
    </main>
  );
}
