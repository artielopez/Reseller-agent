"use client";
import { useEffect, useRef, useState } from "react";
import type { Inquiry } from "@/lib/buyer/domain";
import {
  createQueueClient,
  type QueueState,
} from "@/lib/automation/draft-controls";
import { jobRecovery, questionJob } from "@/lib/automation/worker-health";
import { WorkerHealthSummary } from "./worker-health-summary";

const client = createQueueClient();
export function QuestionDraftActions({
  inquiry,
  disabled,
  onLoadReplies,
}: {
  inquiry: Inquiry;
  disabled: boolean;
  onLoadReplies: () => Promise<void>;
}) {
  const [state, setState] = useState<QueueState | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [needsRefresh, setNeedsRefresh] = useState(true);
  const alive = useRef(true),
    pending = useRef(true),
    attempt = useRef<string | null>(null);
  useEffect(() => {
    alive.current = true;
    let current = true;
    client
      .list()
      .then((value) => {
        if (current) {
          setState(value);
          setNeedsRefresh(false);
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) {
          pending.current = false;
          setBusy(false);
        }
      });
    return () => {
      current = false;
      alive.current = false;
    };
  }, []);
  const job = state && questionJob(state.jobs, inquiry.id);
  const inProgress = job?.status === "queued" || job?.status === "leased";
  const eligible = inquiry.status === "Open" && inquiry.surface === "dm";
  const blocked = disabled || busy;
  async function run(enqueue = false) {
    if (
      pending.current ||
      disabled ||
      (enqueue &&
        (!eligible || needsRefresh || !state || state.paused || inProgress))
    )
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (enqueue) {
        // Preserve identity after a lost acknowledgement; never auto-retry inference.
        attempt.current ??= crypto.randomUUID();
        await client.enqueue(attempt.current, inquiry.id);
        if (!alive.current) return;
        setNotice(
          "Draft requested. Review the saved result before copying; nothing is sent automatically.",
        );
      }
      const latest = await client.list();
      if (!alive.current) return;
      setState(latest);
      setNeedsRefresh(false);
      // A confirmed terminal attempt can be followed by a deliberate new request.
      if (
        latest.jobs.some(
          (j) =>
            j.id === attempt.current &&
            !["queued", "leased"].includes(j.status),
        )
      )
        attempt.current = null;
    } catch (e) {
      if (alive.current) {
        setNeedsRefresh(true);
        setError(
          e instanceof Error
            ? e.message
            : "Refresh draft status before trying again.",
        );
      }
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section
      aria-label="AI draft for this question"
      className="worker-controls"
    >
      <h3>AI draft for this question</h3>
      <p>
        The restricted Mac worker receives the saved question and item/seller
        facts. Buyer names and photos are excluded. A configured worker and a
        verified subscription allowance are needed; this button does not start
        OpenClaw or Hermes.
      </p>
      {error && (
        <p role="alert" className="error">
          {error} Use Refresh draft status to check the saved outcome.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {state && <WorkerHealthSummary state={state} />}
      {!eligible && (
        <p>
          AI worker drafts are available only for Open private questions.
          Templates and manual review remain available for public comments.
        </p>
      )}
      {job && (
        <div>
          <p>Job status: {job.status}</p>
          <p>{jobRecovery(job)}</p>
        </div>
      )}
      {needsRefresh && !busy && (
        <p>Draft status is unconfirmed. Refresh before requesting work.</p>
      )}
      <div className="lab-actions">
        <button
          className="button secondary"
          disabled={blocked}
          onClick={() => void run()}
        >
          Refresh draft status
        </button>
        <button
          className="button secondary"
          disabled={
            blocked ||
            needsRefresh ||
            !eligible ||
            !state ||
            state.paused ||
            inProgress
          }
          onClick={() => void run(true)}
        >
          {job && !inProgress ? "Request another AI draft" : "Request AI draft"}
        </button>
        <button
          className="button secondary"
          disabled={blocked}
          onClick={() => void onLoadReplies()}
        >
          Load saved replies
        </button>
      </div>
      <p>
        No automatic status polling, draft retries, approval or sending. Worker
        settings contains pause, key and cancellation controls.
      </p>
    </section>
  );
}
