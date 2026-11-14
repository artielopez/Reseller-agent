const invalidLink =
  "Copy the unused sign-in or invitation link from your newest Reseller Agent email.";

/** Read a provider confirmation link without visiting it or accepting session tokens.
 * The Supabase SDK verifies this one-time hash against the configured project.
 * Never store/log the input; redirect_to is deliberately not followed.
 */
export function parseSignInLink(
  input: string,
  projectUrl: string,
): { token_hash: string; type: "email" | "invite" } {
  try {
    if (input.length > 8192) throw new Error();
    const url = new URL(input.trim());
    const project = new URL(projectUrl);
    const type = url.searchParams.get("type");
    const token = url.searchParams.get("token");
    if (
      url.protocol !== "https:" ||
      url.origin !== project.origin ||
      url.pathname !== "/auth/v1/verify" ||
      url.username ||
      url.password ||
      url.hash ||
      url.searchParams.getAll("token").length !== 1 ||
      url.searchParams.getAll("type").length !== 1 ||
      !token ||
      !/^[A-Za-z0-9_-]{20,512}$/.test(token) ||
      !["email", "magiclink", "invite"].includes(type || "")
    )
      throw new Error();
    return { token_hash: token, type: type === "invite" ? "invite" : "email" };
  } catch {
    throw new Error(invalidLink);
  }
}
