"use client";
import { useEffect, useRef, useState } from "react";
import { channelNames, channels, type Channel } from "@/lib/domain";
import type { Inquiry, InquiryInput } from "@/lib/buyer/domain";

export function InquiryEditor({
  inquiry,
  busy,
  onSave,
  onCancel,
  onDirtyChange,
}: {
  inquiry: Inquiry;
  busy: boolean;
  onSave: (input: InquiryInput) => Promise<void>;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const [message, setMessage] = useState(inquiry.message),
    [buyer, setBuyer] = useState(inquiry.buyer_name),
    [channel, setChannel] = useState<Channel>(inquiry.channel),
    [surface, setSurface] = useState(inquiry.surface);
  const dirty =
    message !== inquiry.message ||
    buyer !== inquiry.buyer_name ||
    channel !== inquiry.channel ||
    surface !== inquiry.surface;
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return (
    <form
      aria-label="Edit saved buyer question"
      onSubmit={(event) => {
        event.preventDefault();
        if (!dirty || !message.trim() || busy) return;
        void onSave({
          id: inquiry.id,
          item_id: inquiry.item_id,
          channel,
          surface,
          buyer_name: buyer,
          message,
          received_at: inquiry.received_at,
        });
      }}
    >
      <h3 ref={heading} tabIndex={-1}>
        Edit saved question
      </h3>
      <p>
        Correct the recorded question or its source. Saving changes invalidates
        existing reply approval; review a fresh draft afterward. This does not
        edit the original platform message or send anything.
      </p>
      <p>
        The linked item and received time stay the same. Question status remains{" "}
        {inquiry.status}.
      </p>
      <fieldset disabled={busy} className="lab-form">
        <label className="field">
          Saved question channel
          <select
            value={channel}
            onChange={(event) => {
              const value = event.target.value as Channel;
              setChannel(value);
              if (value !== "groups") setSurface("dm");
            }}
          >
            {channels.map((value) => (
              <option key={value} value={value}>
                {channelNames[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Saved question location
          <select
            value={surface}
            onChange={(event) =>
              setSurface(event.target.value as Inquiry["surface"])
            }
          >
            <option value="dm">Private message</option>
            {channel === "groups" && (
              <option value="group_comment">Public group comment</option>
            )}
          </select>
        </label>
        <label className="field">
          Saved buyer name (optional)
          <input
            maxLength={200}
            value={buyer}
            onChange={(event) => setBuyer(event.target.value)}
          />
        </label>
        <label className="field">
          Saved question text
          <textarea
            required
            maxLength={10000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <div className="lab-actions">
          <button
            className="button primary"
            disabled={!dirty || !message.trim()}
          >
            Save question changes
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              if (!dirty || window.confirm("Discard unsaved question changes?"))
                onCancel();
            }}
          >
            Cancel question edits
          </button>
        </div>
      </fieldset>
    </form>
  );
}
