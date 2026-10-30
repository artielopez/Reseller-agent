"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { DraftWorkerControls } from "./draft-worker-controls";
import { AuthPanel } from "./auth-panel";
import { demoMode, configurationError } from "@/lib/config";
import { getSupabase } from "@/lib/supabase";
import { listItems } from "@/lib/repository";
import {
  channelNames,
  channels,
  errorMessage,
  formatPHP,
  type Item,
  type Channel,
} from "@/lib/domain";
import {
  listInquiries,
  readThread,
  mutateThread,
  approvedText,
} from "@/lib/buyer/repository";
import {
  contextMatches,
  templateReply,
  type Inquiry,
  type ReplyContext,
  type Thread,
} from "@/lib/buyer/domain";
import { signOutWithDraftProtection } from "@/lib/buyer/session";
type ReportUnsaved = (part: "form" | "reply", dirty: boolean) => void;
type Mutation = Parameters<typeof mutateThread>[0];
export function BuyerInbox() {
  const unsaved = useRef({ form: false, reply: false });
  const reportUnsaved = useCallback<ReportUnsaved>((part, dirty) => {
    unsaved.current[part] = dirty;
  }, []);
  const [auth, setAuth] = useState<{ ready: boolean; user: User | null }>({
      ready: demoMode,
      user: null,
    }),
    [error, setError] = useState("");
  useEffect(() => {
    if (demoMode || configurationError) return;
    let active = true,
      events = 0;
    const client = getSupabase();
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      events++;
      if (active) setAuth({ ready: true, user: session?.user ?? null });
    });
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || events) return;
        if (error) setError("Could not restore sign-in. Reload and try again.");
        setAuth({ ready: true, user: data.session?.user ?? null });
      })
      .catch(() => {
        if (active) setError("Could not check sign-in. Reload and try again.");
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  return (
    <main className="buyer-lab" id="main">
      {/* Full navigation preserves the native beforeunload warning for unsaved replies. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a className="text-link" href="/">
        ← Back to inventory
      </a>
      <header className="page-heading">
        <div>
          <span className="eyebrow">YOUR SALES CONVERSATIONS</span>
          <h1>Buyer inbox</h1>
          <p>
            Save questions, review replies and keep track of what you answered.
          </p>
        </div>
      </header>
      <div className="demo-banner">
        <span>
          {demoMode ? (
            <>
              <strong>Local demo.</strong> Questions and drafts stay in this
              browser; no account or inbox connection.
            </>
          ) : (
            <>
              <strong>Private workspace.</strong> Manually recorded questions
              and drafts are stored in your Supabase account.
            </>
          )}{" "}
          Nothing is read from Facebook or Carousell, and nothing is sent
          automatically. Templates use saved facts; worker drafts require
          separate setup and review.
        </span>
      </div>
      {(configurationError || error) && (
        <p className="error" role="alert">
          {configurationError || error}
        </p>
      )}
      {!configurationError &&
        (demoMode ? (
          <InboxWorkspace key="demo" reportUnsaved={reportUnsaved} />
        ) : !auth.ready ? (
          <p role="status">Checking sign-in…</p>
        ) : !auth.user ? (
          <AuthPanel />
        ) : (
          <>
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await signOutWithDraftProtection(
                    unsaved.current.form || unsaved.current.reply,
                    () =>
                      window.confirm(
                        "Sign out and discard unsaved question or reply text?",
                      ),
                    () => getSupabase().auth.signOut(),
                  );
                } catch {
                  setError("Could not sign out. Try again.");
                }
              }}
            >
              Sign out
            </button>
            <InboxWorkspace key={auth.user.id} reportUnsaved={reportUnsaved} />
          </>
        ))}
    </main>
  );
}
function InboxWorkspace({ reportUnsaved }: { reportUnsaved: ReportUnsaved }) {
  const [items, setItems] = useState<Item[]>([]),
    [questions, setQuestions] = useState<Inquiry[]>([]),
    [thread, setThread] = useState<Thread | null>(null);
  const [itemId, setItemId] = useState(""),
    [channel, setChannel] = useState<Channel>("marketplace"),
    [surface, setSurface] = useState<"dm" | "group_comment">("dm"),
    [buyer, setBuyer] = useState(""),
    [message, setMessage] = useState("");
  const [written, setWritten] = useState<{
      body: string;
      context: ReplyContext;
    } | null>(null),
    [replyId, setReplyId] = useState("");
  const [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const alive = useRef(true),
    pending = useRef(false),
    inquiryAttempt = useRef<{
      fingerprint: string;
      id: string;
      received_at: string;
    } | null>(null),
    draftIds = useRef(new Map<string, string>());
  useEffect(() => {
    alive.current = true;
    Promise.all([listItems(), listInquiries()])
      .then(([i, q]) => {
        if (!alive.current) return;
        setItems(i);
        setItemId(i[0]?.id || "");
        setQuestions(q);
        setReady(true);
      })
      .catch((e) => {
        if (alive.current) setError(errorMessage(e));
      });
    return () => {
      alive.current = false;
    };
  }, []);
  const editedDirty = useRef(false);
  const reportReplyDirty = useCallback(
    (dirty: boolean) => {
      editedDirty.current = dirty;
      reportUnsaved("reply", dirty);
    },
    [reportUnsaved],
  );
  const dirty = !!message.trim() || !!written?.body.trim();
  useEffect(() => {
    reportUnsaved("form", dirty);
    return () => {
      reportUnsaved("form", false);
    };
  }, [dirty, reportUnsaved]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function run(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function display(t: Thread, clearWritten = false) {
    if (!alive.current) return;
    setThread(t);
    setReplyId(t.replies[0]?.id || "");
    if (clearWritten) setWritten(null);
  }
  async function apply(command: Mutation) {
    if (
      command.op === "status" &&
      editedDirty.current &&
      !window.confirm(
        "Discard unsaved reply edits and change the question status?",
      )
    )
      return;
    const next = await mutateThread(command);
    if (!alive.current) return;
    display(next, command.op === "draft" || command.op === "saveInquiry");
    const q = await listInquiries();
    if (alive.current) setQuestions(q);
  }
  async function reload() {
    if (
      (dirty || editedDirty.current) &&
      !window.confirm("Reload and discard unsaved question or draft text?")
    )
      return;
    await run(async () => {
      const [i, q] = await Promise.all([listItems(), listInquiries()]);
      if (!alive.current) return;
      setItems(i);
      setQuestions(q);
      setThread(null);
      setWritten(null);
      setMessage("");
      setReady(true);
    });
  }
  function saveQuestion() {
    if (
      (written?.body || editedDirty.current) &&
      !window.confirm("Discard unsaved reply text and open the new question?")
    )
      return;
    void run(async () => {
      const values = {
        item_id: itemId,
        channel,
        surface,
        buyer_name: buyer,
        message,
      };
      const fingerprint = JSON.stringify(values);
      if (inquiryAttempt.current?.fingerprint !== fingerprint)
        inquiryAttempt.current = {
          fingerprint,
          id: crypto.randomUUID(),
          received_at: new Date().toISOString(),
        };
      const attempt = inquiryAttempt.current;
      await apply({
        op: "saveInquiry",
        input: { ...values, id: attempt.id, received_at: attempt.received_at },
        expected_revision: null,
      });
      if (alive.current) {
        setMessage("");
        setBuyer("");
        inquiryAttempt.current = null;
      }
    });
  }
  function draft(
    body: string,
    source: "manual" | "template",
    context: ReplyContext,
  ) {
    if (
      editedDirty.current &&
      !window.confirm(
        "Discard unsaved edits to the saved reply and create a new draft?",
      )
    )
      return;
    void run(async () => {
      const key = JSON.stringify([thread!.inquiry.id, body, source, context]);
      let id = draftIds.current.get(key);
      if (!id) {
        id = crypto.randomUUID();
        draftIds.current.set(key, id);
      }
      await apply({
        op: "draft",
        id,
        inquiry_id: thread!.inquiry.id,
        body,
        source,
        context,
      });
    });
  }
  const reply = thread?.replies.find((r) => r.id === replyId);
  return (
    <>
      <div className="lab-actions inbox-toolbar">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void reload()}
        >
          Reload inbox
        </button>
        <span>
          {demoMode
            ? "Browser-local storage"
            : "Refresh to see changes from other devices"}
        </span>
      </div>
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
      {!ready ? (
        <p role="status">
          {error
            ? "Resolve the error, then reload."
            : "Loading saved questions…"}
        </p>
      ) : (
        <>
          {!demoMode && <DraftWorkerControls questions={questions} />}
          <section className="panel section-pad">
            <h2>Record a buyer question</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveQuestion();
              }}
            >
              <fieldset className="lab-form" disabled={busy}>
                <label className="field">
                  Saved item
                  <select
                    required
                    value={itemId}
                    onChange={(e) => setItemId(e.target.value)}
                  >
                    <option value="">Choose an item</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.title}
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
                        setChannel(e.target.value as Channel);
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
                    Question location
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
                  Buyer name (optional)
                  <input
                    maxLength={200}
                    value={buyer}
                    onChange={(e) => setBuyer(e.target.value)}
                  />
                </label>
                <label className="field">
                  Buyer question
                  <textarea
                    required
                    maxLength={10000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </label>
                <p>
                  Record only the sales question you want to handle. Received
                  time is recorded when you save.
                </p>
                <button
                  className="button primary"
                  disabled={!itemId}
                  type="submit"
                >
                  Save question
                </button>
              </fieldset>
            </form>
          </section>
          <section className="panel section-pad">
            <h2>Saved questions</h2>
            <p>Showing up to 200 most recently updated questions.</p>
            {!questions.length ? (
              <p>No questions recorded yet.</p>
            ) : (
              <ul className="inbox-list">
                {questions.map((q) => (
                  <li key={q.id}>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => {
                        if (
                          (written?.body || editedDirty.current) &&
                          !window.confirm(
                            "Discard the unsaved draft and open this question?",
                          )
                        )
                          return;
                        void run(async () =>
                          display(await readThread(q.id), true),
                        );
                      }}
                    >
                      {q.message.slice(0, 90)} · {q.status} ·{" "}
                      {channelNames[q.channel]}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {thread && (
            <section className="panel section-pad">
              <h2>Review this question</h2>
              <p>
                <strong>
                  {channelNames[thread.inquiry.channel]} ·{" "}
                  {thread.inquiry.surface === "dm"
                    ? "Private message"
                    : "Public group comment"}
                </strong>
              </p>
              <p className="lab-question">{thread.inquiry.message}</p>
              <p>Question status: {thread.inquiry.status}</p>
              <div className="inbox-facts">
                <strong>Current saved facts</strong>
                <p>
                  {thread.context.item.title} ·{" "}
                  {formatPHP(thread.context.item.price)} ·{" "}
                  {thread.context.item.condition} · {thread.context.item.status}
                </p>
                <p className="lab-question">
                  {thread.context.item.description}
                </p>
              </div>
              <p>
                Confirm availability, discounts, delivery, payment and meeting
                details yourself. Public replies are visible to the group;
                review them for private information.
              </p>
              <fieldset
                disabled={busy || thread.inquiry.status !== "Open"}
                className="lab-form"
              >
                <button
                  className="button secondary"
                  onClick={() => {
                    if (
                      written?.body &&
                      !window.confirm(
                        "Discard the written draft and prepare a template?",
                      )
                    )
                      return;
                    draft(
                      templateReply(thread.context),
                      "template",
                      thread.context,
                    );
                  }}
                >
                  Prepare template draft
                </button>
                <label className="field">
                  Write a new reply
                  <textarea
                    maxLength={10000}
                    value={written?.body || ""}
                    onChange={(e) =>
                      setWritten({
                        body: e.target.value,
                        context: written?.context || thread.context,
                      })
                    }
                  />
                </label>
                <button
                  className="button secondary"
                  disabled={!written?.body.trim()}
                  onClick={() =>
                    written && draft(written.body, "manual", written.context)
                  }
                >
                  Save written draft
                </button>
              </fieldset>
              {thread.replies.length > 0 && (
                <label className="field inbox-draft-select">
                  Saved draft
                  <select
                    value={replyId}
                    disabled={busy}
                    onChange={(e) => {
                      if (
                        editedDirty.current &&
                        !window.confirm(
                          "Discard unsaved reply edits and switch drafts?",
                        )
                      )
                        return;
                      setReplyId(e.target.value);
                    }}
                  >
                    {thread.replies.map((r, index) => (
                      <option key={r.id} value={r.id}>
                        Draft {thread.replies.length - index} · {r.source} ·{" "}
                        {r.status}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {reply && (
                <ReplyReview
                  key={reply.id + ":" + reply.revision}
                  thread={thread}
                  replyId={reply.id}
                  busy={busy}
                  onApply={(command) => run(() => apply(command))}
                  onError={setError}
                  alive={alive}
                  onDirtyChange={reportReplyDirty}
                />
              )}
              <div className="lab-actions inbox-toolbar">
                <button
                  className="button secondary"
                  disabled={busy || thread.inquiry.status === "Answered"}
                  onClick={() =>
                    void run(() =>
                      apply({
                        op: "status",
                        id: thread.inquiry.id,
                        status: "Answered",
                        expected_revision: thread.inquiry.revision,
                      }),
                    )
                  }
                >
                  Mark answered
                </button>
                <button
                  className="button secondary"
                  disabled={busy || thread.inquiry.status === "Closed"}
                  onClick={() =>
                    void run(() =>
                      apply({
                        op: "status",
                        id: thread.inquiry.id,
                        status: "Closed",
                        expected_revision: thread.inquiry.revision,
                      }),
                    )
                  }
                >
                  Close question
                </button>
                <button
                  className="button secondary"
                  disabled={busy || thread.inquiry.status === "Open"}
                  onClick={() =>
                    void run(() =>
                      apply({
                        op: "status",
                        id: thread.inquiry.id,
                        status: "Open",
                        expected_revision: thread.inquiry.revision,
                      }),
                    )
                  }
                >
                  Reopen question
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
function ReplyReview({
  thread,
  replyId,
  busy,
  onApply,
  onError,
  alive,
  onDirtyChange,
}: {
  thread: Thread;
  replyId: string;
  busy: boolean;
  onApply: (command: Mutation) => Promise<void>;
  onError: (message: string) => void;
  alive: React.RefObject<boolean>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const reply = thread.replies.find((r) => r.id === replyId)!;
  const [body, setBody] = useState(reply.body),
    [copying, setCopying] = useState(false),
    [copyText, setCopyText] = useState(""),
    [notice, setNotice] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const changed = body !== reply.body,
    stale = !contextMatches(reply.context, thread.context);
  useEffect(() => {
    onDirtyChange(changed);
    return () => {
      onDirtyChange(false);
    };
  }, [changed, onDirtyChange]);
  useEffect(() => {
    if (!changed) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);
  async function copy() {
    setCopying(true);
    onError("");
    setNotice("");
    setCopyText("");
    try {
      const current = await approvedText(reply.id, reply.revision);
      if (!alive.current || !mounted.current) return;
      try {
        await navigator.clipboard.writeText(current.body);
        if (alive.current && mounted.current)
          setNotice("Copied. Send it yourself on the original platform.");
      } catch {
        if (alive.current && mounted.current) {
          setCopyText(current.body);
          setNotice(
            "Clipboard unavailable. Select the approved text below and copy it manually.",
          );
        }
      }
    } catch (e) {
      if (alive.current && mounted.current) onError(errorMessage(e));
    } finally {
      if (mounted.current) setCopying(false);
    }
  }
  return (
    <div className="inbox-reply">
      <p>
        Reply status: {reply.status} ·{" "}
        {reply.source === "template"
          ? "Template — no AI used"
          : reply.source === "agent"
            ? "Agent draft — review required"
            : "Written by you"}
      </p>
      {reply.review_note && <p>Review note: {reply.review_note}</p>}
      {stale && (
        <p role="status">
          Saved facts changed. Prepare a fresh draft before approval or copying.
        </p>
      )}
      <fieldset className="lab-form" disabled={busy || copying}>
        <label className="field">
          Reply text
          <textarea
            maxLength={10000}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setCopyText("");
              setNotice("");
            }}
          />
        </label>
        <div className="lab-actions">
          <button
            className="button secondary"
            disabled={!changed || !body.trim()}
            onClick={() =>
              void onApply({
                op: "edit",
                id: reply.id,
                body,
                expected_revision: reply.revision,
              })
            }
          >
            Save reply edits
          </button>
          <button
            className="button primary"
            disabled={
              changed ||
              stale ||
              reply.status === "Approved" ||
              thread.inquiry.status !== "Open"
            }
            onClick={() =>
              void onApply({
                op: "approve",
                id: reply.id,
                expected_revision: reply.revision,
                context: thread.context,
              })
            }
          >
            Approve saved reply
          </button>
          <button
            className="button secondary"
            disabled={
              changed ||
              stale ||
              reply.status !== "Approved" ||
              thread.inquiry.status !== "Open"
            }
            onClick={() => void copy()}
          >
            Copy approved reply
          </button>
        </div>
      </fieldset>
      {notice && <p role="status">{notice}</p>}
      {copyText && (
        <label className="field">
          Approved text to copy manually
          <textarea
            readOnly
            value={copyText}
            onFocus={(e) => e.target.select()}
          />
        </label>
      )}
    </div>
  );
}
