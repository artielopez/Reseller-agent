"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/domain";
import {
  preferenceValues,
  reviewDue,
  type Preferences,
  type PreferencesInput,
} from "@/lib/seller/preferences";
import { sellerWorkspace } from "@/lib/seller/repository";
import type { SellerCommand, SellerWorkspace } from "@/lib/seller/workspace";

export function SellerPreferencesPanel({
  refresh,
  onPreferences,
  reportDirty,
}: {
  refresh: unknown;
  onPreferences: (p: Preferences) => void;
  reportDirty: (dirty: boolean) => void;
}) {
  const [saved, setSaved] = useState<Preferences | null>(null),
    [values, setValues] = useState<PreferencesInput | null>(null),
    [view, setView] = useState<SellerWorkspace | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const alive = useRef(true),
    generation = useRef(0),
    pending = useRef(false),
    dirtyRef = useRef(false),
    editVersion = useRef(0);
  const dirty =
    !!saved &&
    !!values &&
    JSON.stringify(preferenceValues(saved)) !== JSON.stringify(values);
  useEffect(() => {
    dirtyRef.current = dirty;
    reportDirty(dirty);
    return () => reportDirty(false);
  }, [dirty, reportDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // Invalidate pending async requests on unmount, including Strict Mode cleanup.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, []);
  const load = useCallback(
    async (discard = false) => {
      if (pending.current) return;
      const request = ++generation.current,
        editsAtStart = editVersion.current;
      try {
        const next = await sellerWorkspace({ op: "get" });
        if (!alive.current || request !== generation.current) return;
        setView(next);
        onPreferences(next.preferences);
        if (
          (discard && editsAtStart === editVersion.current) ||
          !dirtyRef.current
        ) {
          setSaved(next.preferences);
          setValues(preferenceValues(next.preferences));
        }
        setError("");
      } catch (e) {
        if (alive.current && request === generation.current)
          setError(errorMessage(e));
      }
    },
    [onPreferences],
  );
  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [refresh, load]);
  function edit(next: PreferencesInput) {
    editVersion.current++;
    dirtyRef.current = true;
    setValues(next);
  }
  async function mutate(command: SellerCommand) {
    if (pending.current) return;
    pending.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await sellerWorkspace(command);
      if (!alive.current) return;
      setSaved(next.preferences);
      setValues(preferenceValues(next.preferences));
      setView(next);
      onPreferences(next.preferences);
      setNotice(
        command.op === "review"
          ? "Review recorded. Question statuses are unchanged."
          : "Preferences saved. Changed terms require fresh reply review.",
      );
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section
      className="panel section-pad seller-preferences"
      aria-labelledby="seller-review-heading"
    >
      <h2 id="seller-review-heading">Inbox review</h2>
      <p>Summary of up to 200 saved questions. Refresh to see changes.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {view && (
        <>
          <dl className="seller-summary">
            <div>
              <dt>Open</dt>
              <dd>{view.summary.open}</dd>
            </div>
            <div>
              <dt>Ready to copy</dt>
              <dd>{view.summary.ready}</dd>
            </div>
            <div>
              <dt>Drafts to review</dt>
              <dd>{view.summary.needs_review}</dd>
            </div>
            <div>
              <dt>Received since review</dt>
              <dd>{view.summary.received}</dd>
            </div>
          </dl>
          <p className="muted">
            {view.summary.total} saved questions · Counts checked{" "}
            {new Date(view.summary.as_of).toLocaleString("en-PH", {
              timeZone: "Asia/Manila",
            })}{" "}
            (Manila). Received count starts{" "}
            {new Date(view.summary.since).toLocaleString("en-PH", {
              timeZone: "Asia/Manila",
            })}
            .
          </p>
          {reviewDue(view.preferences, view.summary.as_of) && (
            <p role="status">Your daily inbox review is due.</p>
          )}
          <button
            className="button secondary"
            disabled={busy || dirty}
            onClick={() =>
              void mutate({
                op: "review",
                expected_revision: view.preferences.revision,
              })
            }
          >
            Mark summary reviewed
          </button>
        </>
      )}
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => {
          if (
            dirty &&
            !window.confirm(
              "Reload settings and discard unsaved preference edits?",
            )
          )
            return;
          void load(true);
        }}
      >
        Refresh summary and settings
      </button>
      {values && saved && (
        <details>
          <summary>Seller terms and reminder</summary>
          <p>
            Save general terms for private drafts. Public comment templates
            leave these out. Every reply still needs review.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void mutate({
                op: "save",
                expected_revision: saved.revision,
                input: values,
              });
            }}
            className="lab-form"
          >
            <label className="field">
              General pickup area
              <input
                maxLength={160}
                value={values.pickup_area}
                disabled={busy}
                placeholder="For example, Quezon City"
                onChange={(e) =>
                  edit({ ...values, pickup_area: e.target.value })
                }
              />
            </label>
            <label className="field">
              Delivery notes
              <textarea
                maxLength={500}
                value={values.delivery_notes}
                disabled={busy}
                onChange={(e) =>
                  edit({ ...values, delivery_notes: e.target.value })
                }
              />
            </label>
            <label className="field">
              Payment methods and conditions
              <textarea
                maxLength={300}
                value={values.payment_notes}
                disabled={busy}
                onChange={(e) =>
                  edit({ ...values, payment_notes: e.target.value })
                }
              />
            </label>
            <label className="field">
              <input
                type="checkbox"
                checked={values.digest_enabled}
                disabled={busy}
                onChange={(e) =>
                  edit({ ...values, digest_enabled: e.target.checked })
                }
              />{" "}
              Show a daily review reminder in this inbox
            </label>
            <label className="field">
              Reminder time (Manila)
              <input
                type="time"
                required
                value={values.digest_time}
                disabled={busy}
                onChange={(e) =>
                  edit({ ...values, digest_time: e.target.value })
                }
              />
            </label>
            <p>
              The reminder appears when you open or refresh this inbox after the
              chosen time. It does not send a notification.
            </p>
            <button
              className="button primary"
              disabled={busy || !dirty}
              type="submit"
            >
              {busy ? "Saving…" : "Save preferences"}
            </button>
          </form>
        </details>
      )}
    </section>
  );
}
