"use client";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Box,
  Check,
  CircleHelp,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  Package,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { configurationError, demoMode } from "@/lib/config";
import {
  channelNames,
  emptyItem,
  errorMessage,
  formatPHP,
  statuses,
  type Item,
} from "@/lib/domain";
import { listItems, saveItem } from "@/lib/repository";
import { getSupabase } from "@/lib/supabase";
import { AuthPanel } from "./auth-panel";
import { ItemEditor } from "./item-editor";

export function Workspace() {
  const [user, setUser] = useState<User | null>(null);
  const accountId = useRef<string | null>(null);
  const [authReady, setAuthReady] = useState(demoMode);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All items");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (demoMode || configurationError) return;
    const supabase = getSupabase();
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error)
          setError("Could not restore your session. Please sign in again.");
        setUser(data.session?.user ?? null);
        setAuthReady(true);
      })
      .catch(() => {
        setError("Could not check your session. Please refresh.");
        setAuthReady(true);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user.id ?? null;
      if (accountId.current !== nextId) {
        accountId.current = nextId;
        setItems([]);
        setEditing(null);
        setMessage("");
        setError("");
        setLoading(true);
      }
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!demoMode && !user) return;
    let cancelled = false;
    listItems()
      .then((result) => {
        if (!cancelled) {
          setItems(result);
          setLoading(false);
          setError("");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setError(errorMessage(error));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, reload]);
  async function save(item: Item) {
    const result = await saveItem(
      item,
      items.find((entry) => entry.id === item.id),
    );
    setItems((current) => [
      result,
      ...current.filter((entry) => entry.id !== result.id),
    ]);
    setEditing(null);
    setMessage(`${result.title} saved.`);
    window.scrollTo({ top: 0 });
  }
  function returnToInventory(event: MouseEvent<HTMLAnchorElement>) {
    if (!editing) return;
    event.preventDefault();
    if (
      !window.confirm(
        "Return to inventory? Any unsaved changes will be discarded.",
      )
    )
      return;
    setEditing(null);
    window.scrollTo({ top: 0 });
  }
  async function signOut() {
    if (editing && !window.confirm("Sign out and discard any unsaved changes?"))
      return;
    const { error } = await getSupabase().auth.signOut();
    if (error) {
      setError("Could not sign out. Please try again.");
      return;
    }
    setUser(null);
    setItems([]);
    setEditing(null);
    setLoading(true);
    setError("");
    setMessage("");
  }
  const active = items.filter((item) => item.status !== "Sold");
  const ready = items.filter((item) => item.status === "Ready");
  const sold = items.filter((item) => item.status === "Sold");
  const visible = items.filter(
    (item) =>
      (filter === "All items" || item.status === filter) &&
      `${item.title} ${item.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand" onClick={returnToInventory}>
          <span className="brand-icon">
            <ArrowUpRight size={23} />
          </span>
          <span>
            reseller<span className="brand-light">agent</span>
            <small>A SECOND LIFE, SIMPLIFIED</small>
          </span>
        </Link>
        <div className="sidebar-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <Link
            href="/"
            className="nav-item active"
            onClick={returnToInventory}
          >
            <LayoutGrid size={19} />
            Inventory<span>{items.length}</span>
          </Link>
        </nav>
        <div className="sidebar-note">
          <span className="note-icon">
            <Sparkles size={21} />
          </span>
          <h3>
            Less listing.
            <br />
            More living.
          </h3>
          <p>
            One item, three channels.
            <br />
            Let’s find it a new home.
          </p>
        </div>
        <div className="sidebar-footer">
          <span className="avatar">
            {demoMode ? "D" : user?.email?.slice(0, 1).toUpperCase() || "R"}
          </span>
          <div>
            <strong>
              {demoMode ? "Demo workspace" : "Personal workspace"}
            </strong>
            <small>
              {demoMode
                ? "Explore at your own pace"
                : user?.email || "Sign in to get started"}
            </small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>Inventory</strong>
          </div>
          <span className="mobile-brand">
            reseller<span>agent</span>
          </span>
          <div className="topbar-right">
            <span className="private-label">
              <span />
              {demoMode ? "LOCAL DEMO" : "PRIVATE WORKSPACE"}
            </span>
            {user && (
              <button
                className="icon-button"
                title="Sign out"
                aria-label="Sign out"
                onClick={signOut}
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </header>
        <main id="main">
          {configurationError ? (
            <div className="error" role="alert">
              {configurationError}
            </div>
          ) : !authReady ? (
            <div className="loading" role="status">
              <LoaderCircle className="spin" />
              Checking your session…
            </div>
          ) : !demoMode && !user ? (
            <AuthPanel />
          ) : (
            <>
              {demoMode && (
                <div className="demo-banner">
                  <span>
                    <strong>Demo mode</strong>{" "}
                    <span className="banner-divider">·</span> Sample items and
                    your changes stay in this browser. AI uses templates.
                  </span>
                  {!editing && (
                    <Link href="/buyer-lab" className="text-link">
                      Try buyer replies
                    </Link>
                  )}
                </div>
              )}
              {editing ? (
                <ItemEditor
                  key={editing.id}
                  initial={editing}
                  onSave={save}
                  onClose={() => setEditing(null)}
                />
              ) : (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        A FRESH START FOR YOUR PRELOVED THINGS
                      </span>
                      <h1>
                        A little space.
                        <br className="mobile-break" /> A lot of possibility.
                      </h1>
                      <p>
                        Your items, organized. Your next listing, made easier.
                      </p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => {
                        setEditing(emptyItem());
                        setMessage("");
                      }}
                    >
                      <Plus size={18} />
                      Add item
                    </button>
                  </div>
                  {message && (
                    <div className="notice" role="status">
                      <Check size={16} />
                      {message}
                    </div>
                  )}
                  {error && (
                    <div className="error" role="alert">
                      {error}
                      <button
                        className="text-link"
                        onClick={() => {
                          setLoading(true);
                          setReload((value) => value + 1);
                        }}
                      >
                        Try again
                      </button>
                    </div>
                  )}
                  <p className="inbox-toolbar">
                    <Link href="/inbox" className="button secondary">
                      Open buyer inbox
                    </Link>
                  </p>
                  <div className="stats-grid">
                    <div className="stat">
                      <div>
                        <span className="stat-label">IN YOUR INVENTORY</span>
                        <strong>
                          {active.length.toString().padStart(2, "0")}
                        </strong>
                        <small>items with a next chapter</small>
                      </div>
                      <span className="stat-icon">
                        <Package size={21} />
                      </span>
                    </div>
                    <div className="stat">
                      <div>
                        <span className="stat-label">READY TO POST</span>
                        <strong>
                          {ready.length.toString().padStart(2, "0")}
                        </strong>
                        <small>a few clicks from a new home</small>
                      </div>
                      <span className="stat-icon warm">
                        <ArrowUpRight size={21} />
                      </span>
                    </div>
                    <div className="stat">
                      <div>
                        <span className="stat-label">MARKED AS SOLD</span>
                        <strong>
                          {sold.length.toString().padStart(2, "0")}
                        </strong>
                        <small>
                          {formatPHP(
                            sold.reduce((total, item) => total + item.price, 0),
                          )}{" "}
                          in asking prices
                        </small>
                      </div>
                      <span className="stat-icon green">
                        <ArrowDownLeft size={21} />
                      </span>
                    </div>
                  </div>
                  <section
                    className="inventory-section"
                    aria-labelledby="inventory-title"
                  >
                    <div className="inventory-toolbar">
                      <h2 id="inventory-title">
                        Your inventory <span>{items.length}</span>
                      </h2>
                      <label className="search-box">
                        <Search size={17} />
                        <input
                          type="search"
                          aria-label="Search inventory"
                          placeholder="Search your items…"
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                        />
                      </label>
                    </div>
                    <div
                      className="filter-row"
                      aria-label="Filter by inventory status"
                    >
                      {["All items", ...statuses].map((value) => (
                        <button
                          className={`filter ${filter === value ? "selected" : ""}`}
                          key={value}
                          aria-pressed={filter === value}
                          onClick={() => setFilter(value)}
                        >
                          {value}
                          {value === "All items" && <span>{items.length}</span>}
                        </button>
                      ))}
                    </div>
                    {loading ? (
                      <div className="loading" role="status">
                        <LoaderCircle className="spin" />
                        Loading your items…
                      </div>
                    ) : visible.length === 0 ? (
                      <div className="empty-state">
                        <Box size={32} />
                        <h3>
                          {query || filter !== "All items"
                            ? "No matching items"
                            : "Room for your first item"}
                        </h3>
                        <p>
                          {query || filter !== "All items"
                            ? "Try another search or status."
                            : "Add a few photos and details to get started."}
                        </p>
                      </div>
                    ) : (
                      <div className="inventory-grid">
                        {visible.map((item) => (
                          <article className="item-card" key={item.id}>
                            <button
                              type="button"
                              className="card-button"
                              aria-label={`Edit ${item.title}`}
                              onClick={() => {
                                setEditing(structuredClone(item));
                                setMessage("");
                                window.scrollTo({ top: 0 });
                              }}
                            >
                              <div
                                className={`card-photo category-${item.category.split(" ")[0].toLowerCase()}`}
                              >
                                {item.photos[0]?.url ? (
                                  <>
                                    {/* Private signed URLs and local demo assets are rendered without a public image proxy. */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={item.photos[0].url}
                                      alt={item.title}
                                      loading="lazy"
                                    />
                                  </>
                                ) : (
                                  <Package
                                    size={54}
                                    strokeWidth={1}
                                    className="placeholder-icon"
                                  />
                                )}
                                <span
                                  className={`status-badge status-${item.status.toLowerCase()}`}
                                >
                                  <span />
                                  {item.status}
                                </span>
                                <span className="edit-arrow">
                                  <ArrowUpRight size={18} />
                                </span>
                              </div>
                              <div className="card-body">
                                <span className="card-category">
                                  {item.category} <span>·</span>{" "}
                                  {item.condition}
                                </span>
                                <h3>{item.title}</h3>
                                <strong className="card-price">
                                  {formatPHP(item.price)}
                                </strong>
                                <div className="card-channels">
                                  {item.listings.map((listing) => (
                                    <span
                                      key={listing.channel}
                                      title={`${channelNames[listing.channel]}: ${listing.status}`}
                                      className={
                                        listing.status === "Published"
                                          ? "published"
                                          : ""
                                      }
                                    >
                                      {listing.channel === "carousell"
                                        ? "C"
                                        : listing.channel === "marketplace"
                                          ? "M"
                                          : "G"}
                                    </span>
                                  ))}
                                  <small>
                                    {
                                      item.listings.filter(
                                        (listing) =>
                                          listing.status === "Published",
                                      ).length
                                    }{" "}
                                    of 3 channels posted
                                  </small>
                                </div>
                              </div>
                            </button>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                  <footer className="workspace-footer">
                    <CircleHelp size={15} />
                    <span>
                      You post, we help with the prep. Keep channel statuses up
                      to date after posting.
                    </span>
                    <span className="footer-mark">
                      MADE FOR SECOND CHANCES ↗
                    </span>
                  </footer>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
