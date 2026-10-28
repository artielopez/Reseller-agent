"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
export function AuthPanel() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error } = await getSupabase().auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      setMessage(
        "Check your email for a sign-in link. Open it on this device to continue.",
      );
    } catch {
      setError(
        "Could not send a sign-in link. Check your email, connection, and that your account has been added in Supabase.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-panel panel">
      <span className="eyebrow">YOUR PERSONAL RESALE WORKSPACE</span>
      <h1>
        A little less clutter.
        <br />
        <em>A lot less effort.</em>
      </h1>
      <p>
        Keep your items, photos and listing copy together. Sign in to pick up
        where you left off, on any device.
      </p>
      <form onSubmit={signIn} className="space-y-5">
        <label className="field">
          <span>Email address</span>
          <div className="input-with-icon">
            <Mail size={18} />
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
        </label>
        <button className="button primary w-full" disabled={busy}>
          {busy ? "Sending link…" : "Email me a sign-in link"}
          <ArrowRight size={17} />
        </button>
      </form>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="text-sm muted">
        Private workspace. Your account must first be added by the project
        owner.
      </p>
    </section>
  );
}
