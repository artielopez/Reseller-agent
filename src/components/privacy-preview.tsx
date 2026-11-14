"use client";
import { useEffect, useRef, useState } from "react";
import {
  createPrivacyClient,
  type PrivacyPreview,
} from "@/lib/privacy-preview";
const client = createPrivacyClient();
export function PrivacyPreviewPanel() {
  const [open, setOpen] = useState(false);
  return (
    <section className="panel section-pad">
      <button
        className="button secondary"
        aria-expanded={open}
        aria-controls="privacy-review"
        onClick={() => setOpen(!open)}
      >
        {open ? "Close privacy review" : "Privacy and stored data"}
      </button>
      {open && <Preview />}
    </section>
  );
}
function Preview() {
  const [days, setDays] = useState(30),
    [result, setResult] = useState<PrivacyPreview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true),
    pending = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function preview() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const value = await client.preview(days);
      if (alive.current) setResult(value);
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "Could not load the privacy preview.",
        );
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div
      id="privacy-review"
      role="region"
      aria-label="Privacy review"
      className="worker-controls"
    >
      <h2>Privacy review</h2>
      <p>
        Your inventory, buyer questions, drafts and photos stay in your private
        workspace. Record only sales details you need; buyer names are optional.
        The restricted AI worker receives the question and saved item/seller
        facts, not buyer names or photos.
      </p>
      <p>
        <strong>No automatic deletion is enabled.</strong> This preview does not
        change a retention policy or remove records. Changing the window only
        changes the next preview.
      </p>
      <label>
        History preview window
        <select
          value={days}
          disabled={busy}
          onChange={(e) => {
            setDays(Number(e.target.value));
            setResult(null);
          }}
        >
          <option value={30}>Older than 30 days</option>
          <option value={90}>Older than 90 days</option>
          <option value={180}>Older than 180 days</option>
        </select>
      </label>
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => void preview()}
      >
        Preview stored data
      </button>
      {busy && <p role="status">Checking your stored data…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {result && (
        <div role="status">
          <p>
            Snapshot: {new Date(result.as_of).toLocaleString()} · history
            window: {result.window_days} days.
          </p>
          <ul>
            <li>Saved items: {result.items}</li>
            <li>Linked photo records: {result.photo_references}</li>
            <li>Private photo objects: {result.photo_objects}</li>
            <li>Buyer questions: {result.questions}</li>
            <li>Saved replies: {result.replies}</li>
            <li>
              Older completed conversations to review:{" "}
              {result.history_candidates} ({result.history_candidate_replies}{" "}
              replies)
            </li>
            <li>Possibly unused photos: {result.unlinked_photo_candidates}</li>
          </ul>
          <p>
            History candidates are Answered or Closed questions with no recent
            question, reply or job activity and no queued or leased job. Open
            conversations are excluded.
          </p>
          <p>
            Photo candidates are objects uploaded more than 24 hours ago with no
            saved photo reference in this snapshot. An uncertain or delayed save
            can still reference them later. These counts are not proof that
            deletion is safe.
          </p>
          <p>
            Cleanup is not available here yet. Any future removal needs an exact
            selection, a fresh reference check and your deliberate confirmation.
            Copies already sent to buyers or copied outside this app are not
            affected by app cleanup.
          </p>
        </div>
      )}
    </div>
  );
}
