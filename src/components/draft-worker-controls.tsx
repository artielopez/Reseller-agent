"use client";
import { useEffect, useRef, useState } from "react";
import {
  createQueueClient,
  type QueueState,
  type Enrollment,
} from "@/lib/automation/draft-controls";
import type { Inquiry } from "@/lib/buyer/domain";
const client = createQueueClient();
export function DraftWorkerControls({ questions }: { questions: Inquiry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="panel section-pad">
      <button
        className="button secondary"
        aria-expanded={open}
        aria-controls="draft-worker-controls"
        onClick={() => setOpen(!open)}
      >
        {open ? "Close worker settings" : "Worker settings"}
      </button>
      {open && <Controls questions={questions} />}
    </section>
  );
}
function Controls({ questions }: { questions: Inquiry[] }) {
  const [state, setState] = useState<QueueState | null>(null),
    [enrollment, setEnrollment] = useState<Enrollment | null>(null),
    [name, setName] = useState(""),
    [questionId, setQuestionId] = useState(""),
    [busy, setBusy] = useState(true),
    [checkedAt, setCheckedAt] = useState(0),
    [needsReload, setNeedsReload] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const active = useRef(true),
    pending = useRef(true),
    keyField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    active.current = true;
    let current = true;
    client
      .list()
      .then((value) => {
        if (current) {
          setState(value);
          setCheckedAt(Date.now());
          setNeedsReload(false);
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
      active.current = false;
    };
  }, []);
  async function run(
    action?: () => Promise<unknown>,
    success = "Settings refreshed.",
  ) {
    if (pending.current || (action && needsReload)) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (action) await action();
      if (!active.current) return;
      const latest = await client.list();
      if (active.current) {
        setState(latest);
        setCheckedAt(Date.now());
        setNeedsReload(false);
        setNotice(success);
      }
    } catch (e) {
      if (active.current) {
        setNeedsReload(true);
        setError(
          e instanceof Error
            ? e.message
            : "Reload worker settings before trying again.",
        );
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  const disabled = busy || needsReload || !state;
  const eligible = questions.filter(
    (q) => q.status === "Open" && q.surface === "dm",
  );
  const selected = eligible.some((q) => q.id === questionId) ? questionId : "";
  return (
    <div
      id="draft-worker-controls"
      role="region"
      aria-label="Draft worker controls"
      className="worker-controls"
    >
      <h2>Draft worker controls</h2>
      <p>
        A separately configured Mac worker can prepare private-message drafts
        for your review. Creating a key does not install or start OpenClaw or
        Hermes. Nothing is sent to buyers.
      </p>
      <p>
        Only resume after the restricted worker is configured. Drafting shares
        the 20 daily AI attempts with listing generation. These controls do not
        pause Facebook or Carousell native features.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className="lab-actions">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void run()}
        >
          Reload worker settings
        </button>
        {state && (
          <button
            className="button secondary"
            disabled={disabled}
            onClick={() =>
              void run(
                () => client.pause(!state.paused, state.revision),
                state.paused
                  ? "Drafting resumed. Canceled jobs stay canceled."
                  : "Drafting paused. Outstanding jobs canceled.",
              )
            }
          >
            {state.paused
              ? "Resume drafting"
              : "Pause drafting and cancel jobs"}
          </button>
        )}
      </div>
      {state ? (
        <>
          <p>
            <strong>
              {state.paused ? "Drafting is paused." : "Drafting is enabled."}
            </strong>{" "}
            {needsReload
              ? "This view may be out of date. Reload before changing settings."
              : "Refresh to see changes from other devices."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                setEnrollment(null);
                const created = await client.enroll(name);
                if (active.current) {
                  setEnrollment(created);
                  setName("");
                }
              }, "Worker key created. Save it securely, then hide it.");
            }}
          >
            <label>
              Worker name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
                placeholder="Mac mini draft worker"
                autoComplete="off"
              />
            </label>
            <button
              className="button secondary"
              disabled={disabled || !name.trim() || !!enrollment}
            >
              Create worker key
            </button>
          </form>
          {enrollment && (
            <div className="worker-key">
              <p>
                This key expires{" "}
                {new Date(enrollment.expires_at).toLocaleString()}. It allows
                draft work on your queued private questions. Save it only in the
                dedicated worker’s secret storage; never paste it into buyer
                messages or a general agent chat.
              </p>
              <label>
                One-time worker key
                <input
                  ref={keyField}
                  value={enrollment.token}
                  readOnly
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <p>
                Closing these settings or switching accounts removes the
                display. A copied key remains in your clipboard until replaced.
                Lost a key? Revoke the worker and create a new one.
              </p>
              <div className="lab-actions">
                <button
                  className="button secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(enrollment.token);
                      if (active.current)
                        setNotice(
                          "Worker key copied. Save securely, then clear your clipboard.",
                        );
                    } catch {
                      if (active.current) {
                        keyField.current?.select();
                        setNotice(
                          "Copy was blocked. Select and copy the key manually, then hide it.",
                        );
                      }
                    }
                  }}
                >
                  Copy worker key
                </button>
                <button
                  className="button secondary"
                  onClick={() => setEnrollment(null)}
                >
                  Hide worker key
                </button>
              </div>
            </div>
          )}
          <h3>Enrolled workers</h3>
          {state.workers.length === 0 ? (
            <p>No workers enrolled.</p>
          ) : (
            <ul className="worker-list">
              {state.workers.map((w) => (
                <li key={w.id}>
                  <strong>{w.label}</strong>
                  <span>
                    {w.revoked_at
                      ? "Revoked"
                      : new Date(w.expires_at).getTime() <= checkedAt
                        ? "Expired"
                        : "Key active"}
                  </span>
                  <span>Expires {new Date(w.expires_at).toLocaleString()}</span>
                  <span>
                    {w.last_seen_at
                      ? `Last contact ${new Date(w.last_seen_at).toLocaleString()}`
                      : "No worker contact yet"}
                  </span>
                  {!w.revoked_at && (
                    <button
                      className="button secondary"
                      aria-label={`Revoke ${w.label}`}
                      disabled={disabled}
                      onClick={() =>
                        void run(async () => {
                          await client.revoke(w.id);
                          if (active.current && enrollment?.id === w.id)
                            setEnrollment(null);
                        }, "Worker revoked. Its active jobs were canceled.")
                      }
                    >
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <h3>Draft queue</h3>
          <p>
            Only saved, Open private questions can be queued. Public comments
            are excluded. Pausing cancels outstanding work; resuming does not
            restart it. Completed drafts appear after you reload the inbox.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!selected) return;
              void run(
                () => client.enqueue(crypto.randomUUID(), selected),
                "Question queued for a review draft. No reply was sent.",
              );
            }}
          >
            <label>
              Private question to draft
              <select
                value={selected}
                onChange={(e) => setQuestionId(e.target.value)}
              >
                <option value="">Choose a saved question</option>
                {eligible.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.message.slice(0, 100)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button secondary"
              disabled={disabled || !selected || state.paused}
            >
              Queue draft
            </button>
          </form>
          {state.jobs.length === 0 ? (
            <p>No draft jobs.</p>
          ) : (
            <ul className="worker-list">
              {state.jobs.map((job) => (
                <li key={job.id}>
                  <strong>
                    {questions
                      .find((q) => q.id === job.inquiry_id)
                      ?.message.slice(0, 100) || "Saved private question"}
                  </strong>
                  <span>{job.status}</span>
                  <span>
                    Updated {new Date(job.updated_at).toLocaleString()}
                  </span>
                  {job.status === "failed" && (
                    <span>
                      No draft saved. Check the worker and question before
                      deliberately queuing a new attempt.
                    </span>
                  )}
                  {["queued", "leased"].includes(job.status) && (
                    <button
                      className="button secondary"
                      disabled={disabled}
                      onClick={() =>
                        void run(
                          () => client.cancel(job.id),
                          "Draft job canceled.",
                        )
                      }
                    >
                      Cancel job
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p>Latest 100 jobs. No automatic refresh or retry.</p>
        </>
      ) : (
        <p role="status">
          {error ? "Worker settings unavailable." : "Loading worker settings…"}
        </p>
      )}
    </div>
  );
}
