"use client";

import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUser } from "@/lib/AuthContent";

export default function SignInPage() {
  const router = useRouter();
  const { user, loading, signIn, register } = useUser();
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, router, user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "register") await register(name, email, password);
      else await signIn(email, password);
      router.replace("/");
    } catch (caught) {
      const message = axios.isAxiosError(caught) ? caught.response?.data?.message : null;
      setError(message || "Could not connect to the local server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 items-start justify-center p-6 pt-12">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">{mode === "register" ? "Create a local account" : "Sign in to VidCircle"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your account is stored in the local prototype database.</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "register" && (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === "register" ? 8 : undefined} required />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting || loading}>
            {submitting ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}
          </Button>
        </form>

        <button
          type="button"
          className="mt-4 text-sm text-primary underline-offset-4 hover:underline"
          onClick={() => { setMode(mode === "register" ? "sign-in" : "register"); setError(""); }}
        >
          {mode === "register" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
        <p className="mt-6 text-sm"><Link href="/" className="underline">Back to videos</Link></p>
      </div>
    </main>
  );
}
