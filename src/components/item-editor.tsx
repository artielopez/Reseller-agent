"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  ImagePlus,
  LoaderCircle,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import {
  categories,
  channelLinks,
  channelNames,
  channels,
  conditions,
  errorMessage,
  generatedCopySchema,
  itemInputSchema,
  MAX_PHOTOS,
  publicationStatuses,
  statuses,
  type Channel,
  type Item,
  type Listing,
} from "@/lib/domain";
import { demoMode } from "@/lib/config";
import { getSupabase } from "@/lib/supabase";
import { preparePhoto } from "@/lib/photos";

export function ItemEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: Item;
  onSave: (item: Item) => Promise<void>;
  onClose: () => void;
}) {
  const [item, setItem] = useState<Item>(initial);
  const [price, setPrice] = useState(String(initial.price));
  const [channel, setChannel] = useState<Channel>("carousell");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState("");
  const [dirty, setDirty] = useState(false);
  const listing = item.listings.find((entry) => entry.channel === channel)!;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update(patch: Partial<Item>) {
    setDirty(true);
    setItem((current) => ({ ...current, ...patch }));
  }
  function updateListing(patch: Partial<Listing>) {
    setDirty(true);
    setCopied("");
    setItem((current) => ({
      ...current,
      listings: current.listings.map((entry) =>
        entry.channel === channel ? { ...entry, ...patch } : entry,
      ),
    }));
  }
  function currentItem() {
    if (!price.trim())
      throw new Error("Enter a price in PHP (use 0 for a free item).");
    return {
      ...item,
      ...itemInputSchema.parse({ ...item, price: Number(price) }),
    };
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy("save");
    setError("");
    try {
      await onSave(currentItem());
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy("");
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setBusy("photos");
    try {
      if (files.length + item.photos.length > MAX_PHOTOS)
        throw new Error(`You can add up to ${MAX_PHOTOS} photos per item.`);
      const prepared = [];
      for (const file of Array.from(files))
        prepared.push(await preparePhoto(file));
      update({ photos: [...item.photos, ...prepared] });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy("");
    }
  }
  async function generate() {
    setError("");
    setNotice("");
    if (
      item.listings.some((entry) => entry.title || entry.description) &&
      !window.confirm(
        "Replace the title and description for all three channels? Your item details and publication links will stay the same.",
      )
    )
      return;
    setBusy("generate");
    try {
      const facts = currentItem();
      const token = demoMode
        ? null
        : (await getSupabase().auth.getSession()).data.session?.access_token;
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(itemInputSchema.parse(facts)),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Generation failed. Please try again.");
      const copy = generatedCopySchema.parse(result.copy);
      update({
        listings: item.listings.map((entry) => ({
          ...entry,
          ...copy[entry.channel],
        })),
      });
      setNotice(
        result.source === "ai"
          ? "AI drafts are ready. Check all details before posting, then save your changes."
          : "Template drafts are ready — no AI was used. Review the copy and save your changes.",
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy("");
    }
  }
  async function copy(kind: "title" | "description" | "post") {
    try {
      const text =
        kind === "post"
          ? `${listing.title}\n\n${listing.description}`
          : listing[kind];
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setNotice(
        "Copied. Paste into your listing, then save its URL here after posting.",
      );
    } catch {
      setError(
        "Clipboard access is unavailable. Select the title or description and copy it manually.",
      );
    }
  }
  const name = channelNames[channel];
  return (
    <form onSubmit={save} className="editor">
      <div className="editor-header">
        <button
          type="button"
          className="button quiet"
          disabled={!!busy}
          onClick={() => {
            if (!dirty || window.confirm("Discard unsaved changes?")) onClose();
          }}
        >
          <ArrowLeft size={17} />
          Inventory
        </button>
        <span className="text-sm muted">
          {dirty ? "Unsaved changes" : "Item workspace"}
        </span>
        <button className="button primary" disabled={!!busy}>
          <Save size={16} />
          {busy === "save" ? "Saving…" : "Save item"}
        </button>
      </div>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE ROOM FOR SOMETHING NEW</span>
          <h1>
            {initial.title
              ? "Your item, ready to go."
              : "Give it a second life."}
          </h1>
          <p>A few details now. Three listings in a moment.</p>
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <fieldset disabled={!!busy} className="editor-grid">
        <legend className="sr-only">Item and listing details</legend>
        <div className="space-y-6">
          <section className="panel section-pad">
            <div className="section-heading">
              <h2>
                <span className="step">01</span>The item
              </h2>
              <span className="muted text-sm">Your source of truth</span>
            </div>
            <div className="photo-grid">
              {item.photos.map((photo, index) => (
                <div className="photo-preview" key={photo.id}>
                  {/* User photos use private signed URLs and local data URLs. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={`Item photo ${index + 1}`} />
                  <button
                    type="button"
                    className="photo-remove"
                    aria-label={`Remove photo ${index + 1}`}
                    onClick={() =>
                      update({
                        photos: item.photos.filter(
                          (entry) => entry.id !== photo.id,
                        ),
                      })
                    }
                  >
                    <X size={14} />
                  </button>
                  {index === 0 && <span className="cover-label">Cover</span>}
                </div>
              ))}
              {item.photos.length < MAX_PHOTOS && (
                <label className="upload-tile">
                  <ImagePlus size={24} />
                  <span>{busy === "photos" ? "Preparing…" : "Add photos"}</span>
                  <input
                    aria-label="Upload photos"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(event) => {
                      void upload(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
            <p className="field-hint">
              Up to 6 photos · JPEG, PNG or WebP · 10 MB each. Photos are
              resized before saving. Export iPhone HEIC photos as JPEG.
            </p>
            <div className="space-y-5 mt-6">
              <label className="field">
                <span>Item title</span>
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={item.title}
                  onChange={(event) => update({ title: event.target.value })}
                  placeholder="e.g. Sony wireless headphones, black"
                />
              </label>
              <div className="two-fields">
                <label className="field">
                  <span>Price (PHP)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={9999999.99}
                    step="0.01"
                    required
                    value={price}
                    onChange={(event) => {
                      setPrice(event.target.value);
                      setDirty(true);
                    }}
                  />
                </label>
                <label className="field">
                  <span>Condition</span>
                  <select
                    value={item.condition}
                    onChange={(event) =>
                      update({
                        condition: event.target.value as Item["condition"],
                      })
                    }
                  >
                    {conditions.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Category</span>
                <select
                  value={item.category}
                  onChange={(event) =>
                    update({ category: event.target.value as Item["category"] })
                  }
                >
                  {categories.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Description &amp; known flaws</span>
                <textarea
                  rows={5}
                  maxLength={4000}
                  value={item.description}
                  onChange={(event) =>
                    update({ description: event.target.value })
                  }
                  placeholder="Include size, what’s included, signs of wear, and anything a buyer should know."
                />
              </label>
              <label className="field">
                <span>Inventory status</span>
                <select
                  value={item.status}
                  onChange={(event) =>
                    update({ status: event.target.value as Item["status"] })
                  }
                >
                  {statuses.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <aside className="tip">
            <Sparkles size={20} />
            <div>
              <strong>Good details make good listings.</strong>
              <p>
                Be specific about wear and what’s included. Review every draft
                before you post.
              </p>
            </div>
          </aside>
        </div>
        <section className="panel section-pad listing-panel">
          <div className="section-heading">
            <h2>
              <span className="step">02</span>The listing
            </h2>
            <span className="tag">ASSISTED POSTING</span>
          </div>
          <p className="muted text-sm mb-5">
            Turn your item details into copy for each channel. You stay in
            control of the final words.
          </p>
          <button
            type="button"
            className="button generate w-full"
            onClick={generate}
          >
            {busy === "generate" ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Sparkles size={18} />
            )}
            {busy === "generate"
              ? "Drafting your listings…"
              : "Generate listing copy"}
          </button>
          <p className="field-hint">
            {demoMode
              ? "Demo uses templates. No AI calls or charges."
              : "AI uses your written details, not photos. If no API key is configured, clearly labeled templates are used."}
          </p>
          <div
            className="channel-tabs"
            role="tablist"
            aria-label="Listing channel"
          >
            {channels.map((value) => (
              <button
                type="button"
                role="tab"
                tabIndex={channel === value ? 0 : -1}
                onKeyDown={(event) => {
                  const index = channels.indexOf(value);
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % 3
                      : event.key === "ArrowLeft"
                        ? (index + 2) % 3
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? 2
                            : -1;
                  if (next < 0) return;
                  event.preventDefault();
                  setChannel(channels[next]);
                  setCopied("");
                  document.getElementById(`tab-${channels[next]}`)?.focus();
                }}
                aria-selected={channel === value}
                aria-controls="channel-panel"
                id={`tab-${value}`}
                key={value}
                onClick={() => {
                  setChannel(value);
                  setCopied("");
                }}
              >
                {value === "carousell"
                  ? "Carousell"
                  : value === "marketplace"
                    ? "Marketplace"
                    : "Groups"}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id="channel-panel"
            aria-labelledby={`tab-${channel}`}
            className="space-y-5"
          >
            <label className="field">
              <span>{name} title</span>
              <input
                maxLength={160}
                value={listing.title}
                onChange={(event) =>
                  updateListing({ title: event.target.value })
                }
                placeholder="Generate a draft or write your own title"
              />
            </label>
            <label className="field">
              <span>{name} description</span>
              <textarea
                rows={9}
                maxLength={6000}
                value={listing.description}
                onChange={(event) =>
                  updateListing({ description: event.target.value })
                }
                placeholder="Your editable listing copy will appear here."
              />
            </label>
            <div className="copy-actions">
              {(["title", "description", "post"] as const).map((kind) => (
                <button
                  type="button"
                  className="button secondary small"
                  key={kind}
                  disabled={!listing.title && !listing.description}
                  onClick={() => copy(kind)}
                >
                  {copied === kind ? <Check size={14} /> : <Copy size={14} />}
                  Copy {kind}
                </button>
              ))}
            </div>
            <div className="posting-note">
              <strong>Copy. Post. Keep track.</strong>
              <p>
                Paste your copy and add photos on {name}. Once published, bring
                the listing URL back here.
              </p>
              <a
                className="text-link"
                href={channelLinks[channel]}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open {name}
                <ExternalLink size={14} />
              </a>
            </div>
            <label className="field">
              <span>{name} listing URL</span>
              <input
                type="url"
                value={listing.url}
                maxLength={2048}
                onChange={(event) => updateListing({ url: event.target.value })}
                placeholder={`https://${channel === "carousell" ? "www.carousell.ph/p/…" : "www.facebook.com/…"}`}
              />
            </label>
            <label className="field">
              <span>{name} publication status</span>
              <select
                value={listing.status}
                onChange={(event) =>
                  updateListing({
                    status: event.target.value as Listing["status"],
                  })
                }
              >
                {publicationStatuses.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <p className="field-hint">
              This is your manual record. Updating a status here does not change
              the platform listing.
            </p>
          </div>
        </section>
      </fieldset>
    </form>
  );
}
