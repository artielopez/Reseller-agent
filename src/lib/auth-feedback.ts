const invitationRequired =
  "This workspace is invitation-only. Open your account invitation email first. If it expired, ask the workspace owner for a fresh invitation; this sign-in button cannot renew it.";
const expiredLink =
  "This email link has expired or was already used. If you have not finished accepting your invitation, ask the workspace owner for a fresh one. Otherwise, use this form to request a new sign-in link.";

// Use provider codes only. Never reflect raw provider messages or URL text.
export function authFailureMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  if (code === "signup_disabled" || code === "email_not_confirmed")
    return invitationRequired;
  if (code === "otp_expired") return expiredLink;
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit"
  ) {
    return "Too many sign-in emails were requested. Wait a while before trying again, and use the newest email already in your inbox.";
  }
  if (
    code === "email_address_not_authorized" ||
    code === "email_address_not_verified"
  ) {
    return "Email delivery is not enabled for this address yet. Ask the workspace owner to finish the email-sender setup.";
  }
  return "Could not send a sign-in link. Check your connection and try again. If this continues, contact the workspace owner.";
}

export function authRedirectMessage(hash: string, search: string): string {
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const query = new URLSearchParams(search);
  const code = fragment.get("error_code") || query.get("error_code");
  if (code === "otp_expired") return expiredLink;
  if (fragment.has("error") || query.has("error") || code) {
    return "This email link could not complete sign-in. Use your newest email, or ask the workspace owner for a fresh invitation.";
  }
  return "";
}
