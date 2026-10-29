"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { channels, channelNames, errorMessage, type Item } from "@/lib/domain";
import { demoMode } from "@/lib/config";
import { listItems } from "@/lib/repository";
import { changeDemoState, readDemoState } from "@/lib/automation/demo-store";
import {
  approveReply,
  capture,
  claimReply,
  completeReply,
  decisionContext,
  processEvent,
  setAvailability,
  takeOver,
  updateSettings,
  type Entry,
  type State,
} from "@/lib/automation/engine";

type Action = (state: State, items: Item[]) => State;
export function BuyerLab() {
  const [state, setState] = useState<State | null>(null),
    [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [itemId, setItemId] = useState("");
  const [question, setQuestion] = useState("How much?"),
    [channel, setChannel] = useState<(typeof channels)[number]>("marketplace");
  const [surface, setSurface] = useState<"dm" | "group_comment">("dm");
  const [drafts, setDrafts] = useState<
    Record<string, { body: string; context: string }>
  >({});
  const pending = useRef(false);
  useEffect(() => {
    if (!demoMode) return;
    let cancelled = false;
    Promise.all([readDemoState(), listItems()])
      .then(([saved, inventory]) => {
        if (cancelled) return;
        setState(saved);
        setItems(inventory);
        setItemId(inventory[0]?.id || "");
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function run(action: Action, clearDraftId?: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      // Refresh item facts at every decision; the queue transaction serializes tabs.
      // Inventory lives in a separate demo DB: this is not a live-send atomicity claim.
      const inventory = await listItems();
      const next = await changeDemoState((s) => action(s, inventory));
      setItems(inventory);
      setState(next);
      if (clearDraftId)
        setDrafts((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([id]) => id !== clearDraftId),
          ),
        );
    } catch (e) {
      setError(errorMessage(e));
      try {
        const [latest, inventory] = await Promise.all([
          readDemoState(),
          listItems(),
        ]);
        setState(latest);
        setItems(inventory);
      } catch {
        /* Keep the original storage error and existing edits visible. */
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function add() {
    void run((s, inventory) => {
      const id = crypto.randomUUID();
      return processEvent(
        capture(s, {
          id,
          threadId: id,
          source: "synthetic",
          channel,
          surface,
          ...(surface === "group_comment"
            ? { postId: "sample-post", commentId: id }
            : {}),
          revision: 1,
          itemId: itemId || null,
          body: question,
          complete: true,
          receivedAt: Date.now() - 20_000,
        }),
        id,
        inventory,
        Date.now(),
      );
    });
  }
  function deliver(e: Entry, outcome: "confirmed" | "unknown") {
    void run((s, inventory) => {
      const claim = claimReply(
        s,
        e.id,
        inventory,
        Date.now(),
        decisionContext(state!, e.id, items),
      );
      return claim.token
        ? completeReply(claim.state, e.id, claim.token, outcome, Date.now())
        : claim.state;
    });
  }
  return (
    <main className="buyer-lab" id="main">
      <Link href="/" className="text-link">
        ← Back to inventory
      </Link>
      <header className="page-heading">
        <div>
          <span className="eyebrow">LOCAL DEMO · SAMPLE CONVERSATIONS</span>
          <h1>Buyer reply lab</h1>
          <p>
            Try factual replies and see which questions need your attention.
          </p>
        </div>
      </header>
      <div className="demo-banner">
        <span>
          <strong>Simulation only.</strong> No inbox connection, AI service or
          messages sent. Samples stay in this browser. Use invented questions,
          not private buyer messages.
        </span>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {!state ? (
        <p role="status">
          {error
            ? "Reload after resolving the storage error."
            : "Loading buyer lab…"}
        </p>
      ) : (
        <>
          <fieldset className="panel section-pad lab-controls" disabled={busy}>
            <legend>Reply controls</legend>
            <div className="lab-actions">
              <button
                className="button primary"
                onClick={() =>
                  void run((s) =>
                    updateSettings(s, { paused: !s.settings.paused }),
                  )
                }
              >
                {state.settings.paused
                  ? "Resume simulation"
                  : "Pause simulation"}
              </button>
              <label className="field">
                Reply mode
                <select
                  value={state.settings.mode}
                  onChange={(e) => {
                    const mode = e.target.value as "review" | "simulate";
                    void run((s) => updateSettings(s, { mode }));
                  }}
                >
                  <option value="review">Review every draft</option>
                  <option value="simulate">Routine templates</option>
                </select>
              </label>
            </div>
            <p>
              Mark a channel as using native replies to block custom simulation
              here. These switches do not change Facebook or Carousell settings.
            </p>
            <div className="lab-actions">
              {channels.map((c) => (
                <label key={c}>
                  <input
                    type="checkbox"
                    checked={state.settings.nativeChannels.includes(c)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      void run((s) =>
                        updateSettings(s, {
                          nativeChannels: checked
                            ? [...s.settings.nativeChannels, c]
                            : s.settings.nativeChannels.filter((x) => x !== c),
                        }),
                      );
                    }}
                  />{" "}
                  {channelNames[c]} native replies
                </label>
              ))}
            </div>
          </fieldset>
          <section className="panel section-pad">
            <h2>Try a sample question</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <fieldset disabled={busy} className="lab-form">
                <label className="field">
                  Demo item
                  <select
                    value={itemId}
                    onChange={(e) => setItemId(e.target.value)}
                  >
                    <option value="">Unmatched item</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.title} · {i.status}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="two-fields">
                  <label className="field">
                    Channel
                    <select
                      value={channel}
                      onChange={(e) => {
                        setChannel(e.target.value as typeof channel);
                        setSurface("dm");
                      }}
                    >
                      {channels.map((c) => (
                        <option key={c} value={c}>
                          {channelNames[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Question type
                    <select
                      value={surface}
                      onChange={(e) =>
                        setSurface(e.target.value as typeof surface)
                      }
                    >
                      <option value="dm">Private message</option>
                      {channel === "groups" && (
                        <option value="group_comment">
                          Public group comment
                        </option>
                      )}
                    </select>
                  </label>
                </div>
                <label className="field">
                  Sample question
                  <textarea
                    required
                    maxLength={10000}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                  />
                </label>
                <p>
                  Each sample starts a new conversation, with a 20-second-old
                  timestamp. Try “How much?”, “Available?” or “Can you reserve
                  it?”.
                </p>
                <div className="lab-actions">
                  <button className="button primary" type="submit">
                    Add sample question
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={
                      !items.some(
                        (i) => i.id === itemId && i.status === "Listed",
                      )
                    }
                    onClick={() =>
                      void run((s, inventory) => {
                        const item = inventory.find((i) => i.id === itemId);
                        if (!item) throw new Error("Item no longer exists.");
                        return setAvailability(s, item, Date.now());
                      })
                    }
                  >
                    Confirm demo item available
                  </button>
                </div>
                {state.availability.some((a) => a.itemId === itemId) && (
                  <p role="status">
                    Availability confirmation recorded; valid for 24 hours while
                    item facts stay the same.
                  </p>
                )}
              </fieldset>
            </form>
          </section>
          <section aria-labelledby="questions-heading" className="lab-queue">
            <h2 id="questions-heading">
              Sample conversations ({state.events.length})
            </h2>
            {!state.events.length && (
              <p>Add a sample above to see the draft and review decision.</p>
            )}
            {state.events.map((e) => {
              const closed = ["claimed", "simulated", "unknown"].includes(
                e.status,
              );
              return (
                <article key={e.id} className="panel section-pad">
                  <div className="lab-actions">
                    <strong>
                      {channelNames[e.channel]} ·{" "}
                      {e.surface === "dm"
                        ? "Private message"
                        : "Public comment"}
                    </strong>
                    <span className="lab-status">{e.status}</span>
                  </div>
                  <h3>
                    {items.find((i) => i.id === e.itemId)?.title ||
                      "Unmatched item"}
                  </h3>
                  <p className="lab-question">{e.body}</p>
                  <p role="status">{e.reason}</p>
                  <fieldset disabled={busy} className="lab-form">
                    <label className="field">
                      Reply draft
                      <textarea
                        maxLength={10000}
                        readOnly={closed || e.surface === "group_comment"}
                        value={
                          closed
                            ? (e.reply?.body ?? "")
                            : (drafts[e.id]?.body ?? e.reply?.body ?? "")
                        }
                        onChange={(event) =>
                          setDrafts((d) => ({
                            ...d,
                            [e.id]: {
                              body: event.target.value,
                              context:
                                d[e.id]?.context ??
                                decisionContext(state, e.id, items),
                            },
                          }))
                        }
                      />
                    </label>
                    {!closed && (
                      <div className="lab-actions">
                        <button
                          className="button secondary"
                          onClick={() =>
                            void run(
                              (s, inventory) =>
                                processEvent(s, e.id, inventory, Date.now()),
                              e.id,
                            )
                          }
                        >
                          Process again
                        </button>
                        {e.surface === "dm" && (
                          <button
                            className="button secondary"
                            disabled={
                              !(
                                drafts[e.id]?.body ??
                                e.reply?.body ??
                                ""
                              ).trim()
                            }
                            onClick={() =>
                              void run(
                                (s, inventory) =>
                                  approveReply(
                                    s,
                                    e.id,
                                    drafts[e.id]?.body ?? e.reply?.body ?? "",
                                    inventory,
                                    Date.now(),
                                    drafts[e.id]?.context ??
                                      decisionContext(state, e.id, items),
                                  ),
                                e.id,
                              )
                            }
                          >
                            Approve draft for simulation
                          </button>
                        )}
                        {e.status === "ready" && (
                          <>
                            <button
                              className="button primary"
                              disabled={
                                drafts[e.id] !== undefined &&
                                drafts[e.id]?.body !== e.reply?.body
                              }
                              onClick={() => deliver(e, "confirmed")}
                            >
                              Simulate delivery
                            </button>
                            <button
                              className="button secondary"
                              disabled={
                                drafts[e.id] !== undefined &&
                                drafts[e.id]?.body !== e.reply?.body
                              }
                              onClick={() => deliver(e, "unknown")}
                            >
                              Simulate uncertain result
                            </button>
                          </>
                        )}
                        <button
                          className="button secondary"
                          onClick={() =>
                            void run((s) =>
                              takeOver(
                                s,
                                e.threadId,
                                !s.takeovers.includes(e.threadId),
                              ),
                            )
                          }
                        >
                          {state.takeovers.includes(e.threadId)
                            ? "Resume conversation"
                            : "Take over conversation"}
                        </button>
                      </div>
                    )}
                  </fieldset>
                </article>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}
