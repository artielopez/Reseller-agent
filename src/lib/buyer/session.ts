// Only user-initiated sign-out goes through this guard. Auth expiry still clears UI immediately.
export async function signOutWithDraftProtection(
  unsaved: boolean,
  confirmDiscard: () => boolean,
  signOut: () => Promise<{ error: unknown }>,
): Promise<void> {
  if (unsaved && !confirmDiscard()) return;
  const { error } = await signOut();
  if (error) throw new Error("Could not sign out. Try again.");
}
