"use client";
import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { withRequestDeadline } from "@/lib/request-deadline";
import { parseSignInLink } from "@/lib/pwa-auth";
import { supabaseUrl } from "@/lib/config";
const verificationTimeout =
  "Could not confirm sign-in yet. Check whether your inventory opens before requesting another link.";
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
  const [pastedLink, setPastedLink] = useState("");
  const [verifying, setVerifying] = useState(false);
  const verificationPending = useRef(false);
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
  async function signInHere(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    let params: ReturnType<typeof parseSignInLink>;
    try {
      params = parseSignInLink(pastedLink, supabaseUrl);
    } catch {
      setPastedLink("");
      setError(
        "Copy the unused sign-in or invitation link from your newest Reseller Agent email.",
      );
      return;
    }
    setPastedLink("");
    if (verificationPending.current) {
      setError(verificationTimeout);
      return;
    }
    verificationPending.current = true;
    setVerifying(true);
    try {
      const { data, error } = await withRequestDeadline(
        () =>
          getSupabase()
            .auth.verifyOtp(params)
            .finally(() => {
              verificationPending.current = false;
            }),
        verificationTimeout,
      );
      if (error || !data.session) {
        setError(
          error?.code === "otp_expired"
            ? "This link has expired or was already used. Request a fresh sign-in email, then copy its link without opening it."
            : "Could not verify this link. Use the unused link from your newest Reseller Agent email and check your connection.",
        );
      } else {
        setMessage("Signed in. Opening your inventory…");
      }
    } catch {
      setError(verificationTimeout);
    } finally {
      setVerifying(false);
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
        <button className="button primary w-full" disabled={busy || verifying}>
          {busy ? "Sending link…" : "Email me a sign-in link"}
          <ArrowRight size={17} />
        </button>
      </form>
      <details className="app-sign-in">
        <summary>Sign in inside this app</summary>
        <p>
          If an email link opens Safari instead of this Home Screen app, request
          a fresh email above. In the email, press and hold its sign-in link and
          copy it without opening it. Paste it below. You can also use an unused
          invitation link.
        </p>
        <form onSubmit={signInHere} className="space-y-5">
          <label className="field">
            <span>Unused sign-in link</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              required
              maxLength={8192}
              value={pastedLink}
              onChange={(event) => setPastedLink(event.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy || verifying}>
            {verifying ? "Verifying link…" : "Sign in here"}
          </button>
        </form>
        <p className="text-sm muted">
          Treat this link like a password. It is cleared when submitted and
          verified directly with our sign-in service. Never share it in chat.
        </p>
      </details>
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
