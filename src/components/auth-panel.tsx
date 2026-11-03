"use client";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { withRequestDeadline } from "@/lib/request-deadline";
const emailTimeout =
  "Could not confirm the sign-in email request. Check your inbox before requesting another link; the email may already have been sent.";
import { authFailureMessage, authRedirectMessage } from "@/lib/auth-feedback";
function subscribeToUrlChanges(notify: () => void) {
  window.addEventListener("hashchange", notify);
  window.addEventListener("popstate", notify);
  return () => {
    window.removeEventListener("hashchange", notify);
    window.removeEventListener("popstate", notify);
  };
}
const redirectMessage = () =>
  authRedirectMessage(window.location.hash, window.location.search);
export function AuthPanel() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const linkError = useSyncExternalStore(
    subscribeToUrlChanges,
    redirectMessage,
    () => "",
  );
  const displayedError = error || (!message && !busy ? linkError : "");
  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error } = await withRequestDeadline(
        () =>
          getSupabase().auth.signInWithOtp({
            email: email.trim(),
            options: {
              shouldCreateUser: false,
              emailRedirectTo: window.location.origin,
            },
          }),
        emailTimeout,
      );
      if (error) throw error;
      setMessage(
        "Check your email for a sign-in link. Open it on this device to continue.",
      );
    } catch (error) {
      setError(
        error instanceof Error && error.message === emailTimeout
          ? emailTimeout
          : authFailureMessage(error),
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
      {displayedError && (
        <p role="alert" className="error">
          {displayedError}
        </p>
      )}
      <p className="text-sm muted">
        First time here? Open your invitation email to activate your account.
        Use this form for later sign-ins. Invitations that expire must be resent
        by the workspace owner.
      </p>
    </section>
  );
}
