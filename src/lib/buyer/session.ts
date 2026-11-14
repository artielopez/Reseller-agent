import { getSupabase } from "../supabase";
import { withRequestDeadline } from "../request-deadline";
type Logout = () => Promise<{ error: unknown }>;
const pending = new WeakMap<Logout, ReturnType<Logout>>();
// Stable callback identity makes both app screens share one in-flight SDK logout.
export const signOutCloud: Logout = () => getSupabase().auth.signOut();
const uncertain =
  "Could not confirm sign-out. Refresh to check your session before leaving this device. The original request may still finish; it has not been repeated.";

// Auth.signOut has no AbortSignal. Bound the UI wait without claiming cancellation
// or queueing another logout while the original SDK operation is still pending.
export async function signOutWithDraftProtection(
  unsaved: boolean,
  confirmDiscard: () => boolean,
  signOut: Logout,
): Promise<void> {
  if (unsaved && !confirmDiscard()) return;
  let request = pending.get(signOut);
  if (!request) {
    request = Promise.resolve().then(signOut);
    pending.set(signOut, request);
    void request.then(
      () => pending.delete(signOut),
      () => pending.delete(signOut),
    );
  }
  const { error } = await withRequestDeadline(() => request, uncertain).catch(
    () => {
      throw new Error(uncertain);
    },
  );
  if (error) throw new Error("Could not sign out. Try again.");
}
