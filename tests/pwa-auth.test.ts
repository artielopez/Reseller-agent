import { describe, expect, it } from "vitest";
import { parseSignInLink } from "@/lib/pwa-auth";

const origin = "https://reseller-test.supabase.co";
const token = "a".repeat(64);
const link = `${origin}/auth/v1/verify?token=${token}&type=magiclink&redirect_to=https%3A%2F%2Fapp.example.test`;
describe("sign-in inside an installed app", () => {
  it("extracts an unused provider link without following its redirect", () => {
    expect(parseSignInLink(`  ${link}  `, origin)).toEqual({
      token_hash: token,
      type: "email",
    });
    expect(
      parseSignInLink(link.replace("magiclink", "invite"), origin),
    ).toEqual({ token_hash: token, type: "invite" });
  });
  it.each([
    link.replace("reseller-test", "another-project"),
    link.replace("https:", "http:"),
    link.replace("/verify?", "/logout?"),
    link.replace("magiclink", "recovery"),
    link.replace("magiclink", "signup"),
    link + "&token=second",
    link + "&type=invite",
    link + "#access_token=secret",
    link.replace("https://", "https://someone@"),
    "https://app.example.test/#access_token=already-consumed",
    link.replace(token, ""),
  ])(
    "rejects unrelated or ambiguous links without reflecting private input",
    (value) => {
      expect(() => parseSignInLink(value, origin)).toThrow(
        "Copy the unused sign-in or invitation link from your newest Reseller Agent email.",
      );
    },
  );
});
