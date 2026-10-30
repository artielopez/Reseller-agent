import { it, expect, vi } from "vitest";
import { signOutWithDraftProtection } from "../src/lib/buyer/session";
it("keeps the account and edits intact when discard is canceled", async () => {
  const logout = vi.fn().mockResolvedValue({ error: null });
  await signOutWithDraftProtection(true, () => false, logout);
  expect(logout).not.toHaveBeenCalled();
});
it("signs out after discard approval and avoids a prompt when nothing is dirty", async () => {
  const logout = vi.fn().mockResolvedValue({ error: null }),
    confirm = vi.fn(() => true);
  await signOutWithDraftProtection(true, confirm, logout);
  await signOutWithDraftProtection(false, confirm, logout);
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(logout).toHaveBeenCalledTimes(2);
});
it("reports sign-out failure without pretending the account was cleared", async () => {
  await expect(
    signOutWithDraftProtection(
      false,
      () => true,
      async () => ({ error: new Error("offline") }),
    ),
  ).rejects.toThrow("Could not sign out");
});
