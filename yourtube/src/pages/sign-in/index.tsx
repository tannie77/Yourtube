"use client";

import axios from "axios";
import { useRouter } from "next/router";
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
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useUser } from "@/lib/AuthContext";
import { getLocalTestLocation, saveLocalTestLocation } from "@/lib/security-context";
import styles from "./sign-in.module.css";
import ThemeToggle from "@/components/ThemeToggle";

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
  const localPreviewEnabled = process.env.NODE_ENV === "development";

  useEffect(() => {
    if (!loading && user) router.replace("/");
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
        router.replace("/");
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
      router.replace("/");
    } catch (caught) {
      const message = axios.isAxiosError(caught) ? caught.response?.data?.message : null;
      setError(message || "Could not connect to the local server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function enterLocalPreview() {
    setError("");
    setSubmitting(true);
    try {
      const identifier = window.crypto.randomUUID().replaceAll("-", "");
      await register("Local Preview", `local-preview-${identifier}@example.test`, identifier);
      router.replace("/");
    } catch (caught) {
      const message = axios.isAxiosError(caught) ? caught.response?.data?.message : null;
      setError(message || "Could not open the local preview. Please try again.");
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

  return (
    <main className={styles.authPage}>
      <section className={styles.formSide}>
        <div className={styles.brandRow}>
          <div className={styles.brand} aria-label="YourTube">
            <img className={styles.brandMark} src="/favicon.ico" alt="" />
            <span>YourTube</span>
          </div>
          <ThemeToggle />
        </div>

        <div className={styles.formWrap}>
          <div className={styles.formCard}>
            <h1>{otpChallenge ? "Check your inbox" : isRegistering ? "Create your account" : "Welcome back"}</h1>
            <p className={styles.intro}>
              {otpChallenge
                ? `${otpChallenge.message} Address: ${otpChallenge.destination}`
                : isRegistering
                ? "Join the community and start watching, sharing and creating."
                : "Sign in to keep watching and make this space your own."}
            </p>

            <form onSubmit={submit} className={styles.form}>
              {!otpChallenge && isRegistering && (
                <div className={styles.fieldGroup}>
                  <label htmlFor="name" className={styles.label}>Your name</label>
                  <div className={styles.inputWrap}>
                    <UserRound className={styles.inputIcon} aria-hidden="true" />
                    <input id="name" name="name" type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="What should we call you?" className={styles.input} required />
                  </div>
                </div>
              )}

              {!otpChallenge && (
                <div className={styles.fieldGroup}>
                  <label htmlFor="email" className={styles.label}>Email address</label>
                  <div className={styles.inputWrap}>
                    <Mail className={styles.inputIcon} aria-hidden="true" />
                    <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className={styles.input} aria-invalid={Boolean(error)} aria-describedby={error ? "auth-error" : undefined} required />
                  </div>
                </div>
              )}

              {!otpChallenge && (
                <div className={styles.fieldGroup}>
                  <div className={styles.labelRow}>
                    <label htmlFor="password" className={styles.label}>Password</label>
                    {isRegistering && <span className={styles.hint}>At least 8 characters</span>}
                  </div>
                  <div className={styles.inputWrap}>
                    <LockKeyhole className={styles.inputIcon} aria-hidden="true" />
                    <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={isRegistering ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={isRegistering ? 8 : undefined} placeholder={isRegistering ? "Create a password" : "Enter your password"} className={`${styles.input} ${styles.passwordInput}`} aria-invalid={Boolean(error)} aria-describedby={error ? "auth-error" : undefined} required />
                    <button type="button" onClick={() => setShowPassword((visible) => !visible)} className={styles.revealButton} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
                      {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              )}

              {!otpChallenge && (
                <details className={styles.localOptions}>
                  <summary><MapPin aria-hidden="true" /> Local test location <span>Optional</span></summary>
                  <div className={styles.localOptionsBody}>
                    <p>Changing either value on a later sign-in triggers local OTP verification.</p>
                    <div className={styles.locationGrid}>
                      <div className={styles.fieldGroup}><label htmlFor="test-city" className={styles.label}>Test city</label><input id="test-city" value={testCity} onChange={(event) => setTestCity(event.target.value)} maxLength={80} placeholder="e.g. Pune" className={styles.smallInput} /></div>
                      <div className={styles.fieldGroup}><label htmlFor="test-state" className={styles.label}>Test state</label><input id="test-state" value={testState} onChange={(event) => setTestState(event.target.value)} maxLength={80} placeholder="e.g. Maharashtra" className={styles.smallInput} /></div>
                    </div>
                  </div>
                </details>
              )}

              {otpChallenge && (
                <div className={styles.fieldGroup}>
                  <label htmlFor="otp-code" className={styles.label}>One-time code</label>
                  <div className={styles.inputWrap}>
                    <KeyRound className={styles.inputIcon} aria-hidden="true" />
                    <input id="otp-code" name="otp-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className={`${styles.input} ${styles.otpInput}`} aria-invalid={Boolean(error)} aria-describedby={error ? "auth-error" : "otp-help"} required autoFocus />
                  </div>
                  <p id="otp-help" className={styles.otpHelp}><ShieldCheck aria-hidden="true" />The code expires in ten minutes.</p>
                </div>
              )}

              {error && <p id="auth-error" role="alert" className={styles.error}><AlertCircle aria-hidden="true" />{error}</p>}

              <button type="submit" disabled={submitting || loading} className={styles.submitButton}>
                {submitting ? "Please wait…" : loading ? "Checking session…" : otpChallenge ? "Verify and sign in" : isRegistering ? "Create your account" : "Sign in"}
                {!submitting && !loading && <ArrowRight aria-hidden="true" />}
              </button>
            </form>

            {localPreviewEnabled && !otpChallenge && <div className={styles.localPreview}>
              <span>Testing the app locally?</span>
              <button type="button" onClick={() => { void enterLocalPreview(); }} disabled={submitting || loading} className={styles.localPreviewButton}>Continue with local preview <ArrowRight aria-hidden="true" /></button>
              <p>Creates a local demo account so you can explore Membership and videos.</p>
            </div>}

            {otpChallenge ? (
              <p className={styles.modeSwitch}>Not this sign-in? <button type="button" onClick={restartSignIn}>Start again</button></p>
            ) : (
              <p className={styles.modeSwitch}>
                {isRegistering ? "Already have an account?" : "New to YourTube?"}{" "}
                <button type="button" onClick={changeMode}>{isRegistering ? "Sign in" : "Create an account"}</button>
              </p>
            )}
          </div>
        </div>

        <div className={styles.footer}><span>© {new Date().getFullYear()} YourTube</span><span>Local prototype</span></div>
      </section>

    </main>
  );
}
