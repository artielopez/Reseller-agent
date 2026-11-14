import { describe, expect, it } from "vitest";
import {
  authFailureMessage,
  authRedirectMessage,
} from "../src/lib/auth-feedback";

describe("private sign-in recovery", () => {
  it("explains the signup-disabled response without suggesting public registration", () => {
    expect(authFailureMessage({ code: "signup_disabled" })).toContain(
      "cannot renew it",
    );
    expect(authFailureMessage({ code: "email_not_confirmed" })).toContain(
      "invitation email first",
    );
  });
  it("recognizes an expired invitation return in either supported URL location", () => {
    for (const [hash, search] of [
      ["#error=access_denied&error_code=otp_expired", ""],
      ["", "?error_code=otp_expired"],
    ]) {
      expect(authRedirectMessage(hash, search)).toContain("fresh one");
    }
  });
  it("does not display arbitrary provider text or URL contents", () => {
    const privateText = "secret-token-or-untrusted-html";
    expect(
      authFailureMessage({ code: "unrecognized", message: privateText }),
    ).not.toContain(privateText);
    expect(
      authRedirectMessage(`#error_description=${privateText}&error=bad`, ""),
    ).not.toContain(privateText);
    expect(
      authRedirectMessage(
        "#access_token=synthetic&refresh_token=synthetic",
        "",
      ),
    ).toBe("");
  });
  it("distinguishes sending limits from sender setup and network failures", () => {
    expect(
      authFailureMessage({ code: "over_email_send_rate_limit" }),
    ).toContain("Wait a while");
    expect(
      authFailureMessage({ code: "email_address_not_authorized" }),
    ).toContain("email-sender setup");
    expect(authFailureMessage(new TypeError("Failed to fetch"))).toContain(
      "Check your connection",
    );
  });
});
