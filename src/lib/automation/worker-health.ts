import type { QueueState } from "./draft-controls";
type Job = QueueState["jobs"][number];
const RECENT_CONTACT_MS = 5 * 60_000;

/** A snapshot of recorded activity, never a liveness or provider-login probe. */
export function workerHealth(state: QueueState, now: number) {
  const lastCompletedAt =
    state.jobs
      .filter((j) => j.status === "completed")
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0]
      ?.updated_at ?? null;
  const active = state.workers.filter(
    (w) => !w.revoked_at && Date.parse(w.expires_at) > now,
  );
  const contacts = active.flatMap((w) =>
    w.last_seen_at ? [Date.parse(w.last_seen_at)] : [],
  );
  const latest = contacts.length ? Math.max(...contacts) : null;
  let title: string, detail: string;
  if (state.paused) {
    title = "Drafting is paused";
    detail =
      "No queued work can start. Check the restricted Mac worker before deliberately resuming in Worker settings.";
  } else if (!active.length) {
    title = "No active worker key";
    detail =
      "A configured worker needs an unexpired, unrevoked key. Creating a key alone does not start the Mac worker.";
  } else if (latest === null) {
    title = "Waiting for worker contact";
    detail =
      "No contact is recorded for an active key. Check that the Mac is awake, connected and configured for a supervised run.";
  } else if (!Number.isFinite(now) || latest > now) {
    title = "Check device time";
    detail =
      "The recorded contact is ahead of this device’s clock. Reload after checking the clock; availability cannot be inferred.";
  } else if (now - latest >= RECENT_CONTACT_MS) {
    title = "Worker contact is old";
    detail =
      "No contact within the last five minutes. A one-shot worker may have finished normally. Check the Mac, network and provider sign-in before a new supervised run.";
  } else {
    title = "Recent worker contact";
    detail =
      "Contact within five minutes does not confirm the Mac is still running or that the model login works. The subscription worker runs once, not continuously.";
  }
  return { title, detail, lastCompletedAt };
}

export function questionJob(jobs: Job[], inquiryId: string) {
  const own = jobs
    .filter((j) => j.inquiry_id === inquiryId)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  return (
    own.find((j) => j.status === "queued" || j.status === "leased") ?? own[0]
  );
}

/** Deliberately allowlisted text: provider/server error bodies never enter the UI. */
export function jobRecovery(job: Job): string {
  if (job.status === "completed")
    return "Draft saved for your review. Load saved replies, review the facts, then approve and copy. Nothing was sent.";
  if (job.status === "queued")
    return "Waiting for a configured worker. A request does not start the Mac or sign into the model.";
  if (job.status === "leased")
    return "Claimed by a worker; completion is not confirmed. If the Mac disconnected, check the saved replies and worker before another attempt.";
  const reasons: Record<string, string> = {
    lease_expired:
      "The worker lease expired. A model attempt may already have run. Do not retry automatically; check saved replies and the Mac before deliberately requesting another draft.",
    context_changed:
      "The saved facts changed. Reload this question and review the item and seller terms before requesting another draft.",
    runtime_unverified:
      "The restricted runtime could not be verified. Complete the Mac preflight before requesting another draft.",
    provider_unavailable:
      "The model provider was unavailable. Check its sign-in and subscription allowance privately on the Mac; do not paste credentials here.",
    invalid_output:
      "The model result did not pass validation. Review the question and facts; no usable draft was saved for this job.",
    timeout:
      "The draft timed out. The provider may have used allowance. Check saved replies before deliberately requesting another draft.",
    paused:
      "Canceled when drafting was paused. Resuming does not restart canceled jobs.",
    worker_revoked:
      "Canceled because the worker key was revoked. Configure a valid worker before a new request.",
    owner_canceled: "Canceled by you. It will not restart automatically.",
  };
  return (
    reasons[job.reason ?? ""] ??
    "No completed draft is confirmed for this job. Check saved replies and the worker before deliberately requesting another attempt."
  );
}
