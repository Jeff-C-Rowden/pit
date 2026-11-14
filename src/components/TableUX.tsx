"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { money, useUser } from "./useUser";
import PauseStatus from "./PauseStatus";
import Link from "next/link";
import { recordAchievement } from "@/lib/achievements";
import { HowItPlays } from "./HowItPlays";
import { celebrationLevel, playChip, playPayout, shouldSlidePayout, TABLE_TIPS, rulesHref } from "@/lib/feel";

const LOADED_AT = typeof performance !== "undefined" ? performance.now() : 0;
const settled = () => typeof performance !== "undefined" && performance.now() - LOADED_AT > 1500;

export function ActionDock({ hint, children, busy }: { hint?: string; children: ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Publish the dock's real height so the page can always scroll clear of it.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--dock-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty("--dock-h"); };
  }, []);
  return (
    <div ref={ref} className={`action-dock${busy ? " is-busy" : ""}`} aria-busy={busy || undefined}>
      <div className="action-dock-inner">
        <PauseStatus />
        {hint && <p className="table-hint">{hint}</p>}
        <div className="action-dock-row">{children}</div>
      </div>
    </div>
  );
}

export type HandResultTone = "win" | "loss" | "push";

/** A quiet losing-spin note dims this long after it appears (it never flashes or plays a sound). */
export const QUIET_LOSS_DIM_MS = 1200;

export function OutcomeBanner({
  win,
  push,
  amountCents,
  message,
  title,
  subtitle,
  stakeCents,
  cageHref,
  quiet,
}: {
  /** Slot Scout S3: a losing spin resolves quietly (muted, compact, no entry animation, dims after a beat). */
  quiet?: boolean;
  /** Link to the matching ledger lines in the Cage. */
  cageHref?: string | null;
  /** What was risked on this result; lets effects scale with real profit. */
  stakeCents?: number | null;
  win?: boolean;
  push?: boolean;
  amountCents?: number | null;
  message?: string | null;
  /** Big who-won headline (e.g. YOU WIN / DEALER WINS). */
  title?: string | null;
  /** Detail line under the headline. Falls back to `message` then defaults. */
  subtitle?: string | null;
}) {
  const hasAmount = amountCents != null && amountCents !== undefined;
  const fxTone: HandResultTone = push ? "push" : win ? "win" : "loss";
  const level = fxTone === "win" ? celebrationLevel(stakeCents, amountCents) : 0;
  const slide = shouldSlidePayout(fxTone, amountCents);
  useEffect(() => {
    if (slide) playPayout(level);
  }, [slide, level, amountCents]);
  const [dimmed, setDimmed] = useState(false);
  useEffect(() => {
    setDimmed(false);
    if (!quiet) return;
    const t = window.setTimeout(() => setDimmed(true), QUIET_LOSS_DIM_MS);
    return () => window.clearTimeout(t);
  }, [quiet, title, subtitle]);
  if (!message && !title && !subtitle && !hasAmount && win == null && !push) return null;

  const tone: HandResultTone = push ? "push" : win ? "win" : "loss";

  let headline = (title || "").trim();
  if (!headline) {
    if (tone === "push") headline = "PUSH";
    else if (tone === "win") headline = "YOU WIN";
    else headline = "YOU LOSE";
  }

  let detail = (subtitle ?? message ?? "").trim();
  if (!detail) {
    if (tone === "push") {
      detail = hasAmount
        ? `${money(amountCents || 0)} returned to your stack`
        : "Stake returned to your stack";
    } else if (tone === "win") {
      detail = hasAmount
        ? `${money(amountCents || 0)} added to your stack`
        : "Payout added to your stack";
    } else {
      detail = "You lost this hand.";
    }
  }

  return (
    <div
      className={`result-banner hand-result ${tone} fx-l${level}${quiet ? " quiet" : ""}${quiet && dimmed ? " dimmed" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="result-banner-title">{headline}</div>
      {detail ? <div className="result-banner-sub">{detail}</div> : null}
      {cageHref ? <a className="cage-link" href={cageHref}>View in Cage →</a> : null}
      {slide && (
        <div className="pay-slide" aria-hidden>
          <ChipStack cents={amountCents || 0} size={24} maxChips={6} showTotal={false} quiet />
        </div>
      )}
    </div>
  );
}

/** Alias for pages that prefer a HandResult name. */
export const HandResult = OutcomeBanner;

export type ChipTone = "white" | "red" | "green" | "black" | "purple" | "yellow";

/** Standard rack + closest mapping for Pit bet sizes. */
export const CHIP_DENOMS = [100000, 50000, 10000, 5000, 2500, 1000, 500, 250, 100, 50, 25] as const;

const TONE: Record<ChipTone, {
  body: string; hi: string; dark: string; edge: string; rim: string;
  spot: string; inlay: string; center: string; text: string; ring: string;
}> = {
  white:  { body: "#efe6d2", hi: "#fffaf0", dark: "#c9bda4", edge: "#b7a88c", rim: "#d8ccb4", spot: "#2c2418", inlay: "#5a4c38", center: "#f6f0e2", text: "#1a140c", ring: "#8a7a5c" },
  red:    { body: "#b01c28", hi: "#d94a4a", dark: "#6e1018", edge: "#4a0c10", rim: "#8a151c", spot: "#f4ead8", inlay: "#f4ead8", center: "#8e151c", text: "#fff8ee", ring: "#f4ead8" },
  green:  { body: "#1a7a4c", hi: "#3caa72", dark: "#0d3e28", edge: "#08281a", rim: "#146038", spot: "#f4ead8", inlay: "#e8d5a3", center: "#125c3a", text: "#fff8ee", ring: "#e8d5a3" },
  black:  { body: "#1a1a1a", hi: "#3a3a3a", dark: "#050505", edge: "#000", rim: "#2a2a2a", spot: "#c9a227", inlay: "#e8d5a3", center: "#111", text: "#e8d5a3", ring: "#c9a227" },
  purple: { body: "#5c2a7a", hi: "#8a4ab0", dark: "#32144a", edge: "#1e0c2c", rim: "#4a2068", spot: "#f4ead8", inlay: "#e8d5a3", center: "#4a1e66", text: "#fff8ee", ring: "#d4b8f0" },
  yellow: { body: "#e0a018", hi: "#f4cc5a", dark: "#8a5c08", edge: "#5a3c06", rim: "#c88814", spot: "#2a1a08", inlay: "#1a1208", center: "#d49410", text: "#1a1208", ring: "#2a1a08" },
};

export function chipTone(cents: number): ChipTone {
  if (cents >= 100000) return "yellow";
  if (cents >= 50000) return "purple";
  if (cents >= 10000) return "black";
  if (cents >= 2500) return "green";
  if (cents >= 250) return "red";
  return "white";
}

export function chipLabel(cents: number): string {
  const abs = Math.abs(cents);
  if (abs >= 100000 && abs % 100000 === 0) return `$${abs / 100000}k`;
  if (abs % 100 === 0) return `$${abs / 100}`;
  if (abs < 100) return `${abs}¢`;
  const d = Math.floor(abs / 100);
  const c = abs % 100;
  return `$${d}.${String(c).padStart(2, "0")}`;
}

export function breakIntoChips(cents: number, maxChips = 10): number[] {
  let rem = Math.max(0, Math.round(cents));
  const out: number[] = [];
  for (const d of CHIP_DENOMS) {
    while (rem >= d && out.length < maxChips) {
      out.push(d);
      rem -= d;
    }
    if (out.length >= maxChips) break;
  }
  if (out.length === 0 && cents > 0) out.push(cents < 25 ? 25 : CHIP_DENOMS.find((d) => d <= cents) || 25);
  return out;
}

export function rackColumns(cents: number, maxEach = 10): { denom: number; count: number }[] {
  const denoms = [100000, 50000, 10000, 2500, 500, 100, 50, 25];
  let rem = Math.max(0, Math.round(cents));
  const cols: { denom: number; count: number }[] = [];
  for (const d of denoms) {
    const n = Math.floor(rem / d);
    if (n > 0) {
      cols.push({ denom: d, count: Math.min(n, maxEach) });
      rem -= n * d;
    }
  }
  return cols;
}

export function ClayChip({
  cents,
  size = 56,
  selected = false,
}: {
  cents: number;
  size?: number;
  selected?: boolean;
}) {
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  const tone = chipTone(cents);
  const t = TONE[tone];
  const label = chipLabel(cents);
  const spots = size < 34 ? 6 : 8;
  const stripes = size < 34 ? 1 : 3;
  const fontSize = size < 34 ? 9 : size < 44 ? 11 : label.length > 4 ? 12 : 14;
  return (
    <svg
      className={`clay-face ${selected ? "sel" : ""}`}
      width={size}
      height={Math.round(size * 1.1)}
      viewBox="0 0 100 110"
      aria-hidden
    >
      <defs>
        <radialGradient id={`cb${uid}`} cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor={t.hi} />
          <stop offset="55%" stopColor={t.body} />
          <stop offset="100%" stopColor={t.dark} />
        </radialGradient>
        <radialGradient id={`cc${uid}`} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor={t.hi} />
          <stop offset="100%" stopColor={t.center} />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="62" rx="46" ry="46" fill={t.edge} />
      <rect x="4" y="50" width="92" height="12" fill={t.edge} />
      <circle cx="50" cy="50" r="46" fill={`url(#cb${uid})`} />
      <circle cx="50" cy="50" r="45" fill="none" stroke={t.rim} strokeWidth="2.2" />
      {Array.from({ length: spots }, (_, i) => {
        const base = (i * 360) / spots;
        const deltas = stripes === 1 ? [0] : [-7.2, 0, 7.2];
        return deltas.map((d, j) => (
          <rect
            key={`${i}-${j}`}
            x="47.4"
            y="5.2"
            width="5.2"
            height="12.5"
            rx="1.6"
            fill={t.spot}
            transform={`rotate(${base + d} 50 50)`}
          />
        ));
      })}
      <circle cx="50" cy="50" r="30" fill="none" stroke={t.inlay} strokeWidth="2.4" />
      <circle cx="50" cy="50" r="25.5" fill={`url(#cc${uid})`} />
      <circle cx="50" cy="50" r="25.5" fill="none" stroke={t.ring} strokeWidth="1.1" opacity="0.85" />
      <path
        d="M42 44c4-6 12-6 16 0"
        fill="none"
        stroke={t.ring}
        strokeWidth="1.1"
        opacity="0.55"
      />
      <text
        x="50"
        y={label.length > 4 ? 56 : 57}
        textAnchor="middle"
        fill={t.text}
        fontSize={fontSize}
        fontWeight="800"
        fontFamily='Palatino, "Palatino Linotype", Georgia, serif'
        letterSpacing="-0.4"
      >
        {label}
      </text>
    </svg>
  );
}

export function Chip({
  cents,
  selected,
  onClick,
  label,
  size = 56,
}: {
  cents: number;
  selected?: boolean;
  onClick?: () => void;
  label?: string;
  size?: number;
}) {
  const inner = <ClayChip cents={cents} size={size} selected={!!selected} />;
  const aria = label || `Bet ${money(cents)}`;
  if (onClick) {
    return (
      <button
        type="button"
        className={`clay-chip-btn ${selected ? "sel" : ""}`}
        onClick={onClick}
        aria-pressed={!!selected}
        aria-label={aria}
      >
        {inner}
      </button>
    );
  }
  return (
    <span className={`clay-chip-btn ${selected ? "sel" : ""}`} aria-hidden>
      {inner}
    </span>
  );
}

/** Parse a dollars string (optional cents) to integer cents, or null if incomplete/invalid. */
export function parseDollarInput(raw: string): number | null {
  const t = raw.trim();
  if (!t || t.endsWith(".")) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const dollars = Number(t);
  if (!Number.isFinite(dollars)) return null;
  return Math.round(dollars * 100);
}

export function CustomWagerInput({
  selected,
  onSelect,
  minCents = 25,
  maxCents = 500_000,
}: {
  selected: number;
  onSelect: (cents: number) => void;
  minCents?: number;
  maxCents?: number;
}) {
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [committed, setCommitted] = useState<number | null>(null);
  const isSelected = committed != null && selected === committed;

  function tryApply(raw: string, commitEmpty = false) {
    const t = raw.trim();
    if (!t) {
      setHint(null);
      if (commitEmpty) setCommitted(null);
      return;
    }
    if (t.endsWith(".") || !/^\d*\.?\d{0,2}$/.test(t)) {
      // still typing or invalid chars already filtered
      if (!/^\d*\.?\d{0,2}$/.test(t)) setHint("Enter dollars (e.g. 7.50)");
      return;
    }
    const cents = parseDollarInput(t);
    if (cents == null) return; // incomplete (e.g. trailing ".")
    if (cents < minCents) {
      setHint(`Min ${money(minCents)}`);
      return;
    }
    if (cents > maxCents) {
      setHint(`Max ${money(maxCents)}`);
      return;
    }
    setHint(null);
    setCommitted(cents);
    onSelect(cents);
  }

  return (
    <label className={`custom-wager${isSelected ? " sel" : ""}`}>
      <span className="custom-wager-label">Custom $</span>
      <input
        type="text"
        inputMode="decimal"
        className="custom-wager-input"
        value={draft}
        placeholder="0.00"
        aria-label="Custom wager in dollars"
        aria-invalid={hint ? true : undefined}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) {
            setDraft(v);
            tryApply(v);
          }
        }}
        onBlur={() => tryApply(draft, true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            tryApply(draft, true);
          }
        }}
      />
      {hint && <span className="custom-wager-hint" role="status">{hint}</span>}
    </label>
  );
}

export function ChipRow({
  amounts,
  selected,
  onSelect,
  minCents,
  maxCents,
}: {
  amounts: number[];
  selected: number;
  onSelect: (n: number) => void;
  minCents?: number;
  maxCents?: number;
}) {
  const lo = minCents ?? Math.min(25, ...amounts);
  const hi = maxCents ?? 500_000;
  return (
    <div className="chip-row">
      {amounts.map((c) => (
        <Chip key={c} cents={c} selected={selected === c} onClick={() => onSelect(c)} />
      ))}
      <CustomWagerInput
        selected={selected}
        onSelect={onSelect}
        minCents={lo}
        maxCents={hi}
      />
    </div>
  );
}

export function ChipStack({
  cents,
  size = 40,
  maxChips = 10,
  showTotal = true,
  winning = false,
  quiet = false,
}: {
  /** No placement click (pots, payouts). */
  quiet?: boolean;
  cents: number;
  size?: number;
  maxChips?: number;
  showTotal?: boolean;
  winning?: boolean;
}) {
  const chips = useMemo(() => breakIntoChips(cents, maxChips), [cents, maxChips]);
  const prev = useRef(0);
  useEffect(() => {
    if (!quiet && !winning && cents > prev.current && settled()) playChip();
    prev.current = cents;
  }, [cents, quiet, winning]);
  if (cents <= 0 || chips.length === 0) return null;
  const lift = Math.max(4, Math.round(size * 0.12));
  const pileH = Math.round(size * 1.1) + (chips.length - 1) * lift;
  return (
    <div className={`chip-stack ${winning ? "win-tick" : ""}`} style={{ width: size }}>
      <div className="chip-stack-pile" style={{ width: size, height: pileH }}>
        {chips.map((c, i) => (
          <div
            key={`${c}-${i}`}
            className="chip-stack-unit chip-drop"
            style={{ bottom: i * lift, zIndex: i + 1, width: size }}
          >
            <ClayChip cents={c} size={size} />
          </div>
        ))}
      </div>
      {showTotal && <div className="chip-stack-total">{money(cents)}</div>}
    </div>
  );
}

export function ChipRack({
  cents,
  label,
  compact = false,
  highlight = false,
}: {
  cents: number;
  label?: string;
  compact?: boolean;
  highlight?: boolean;
}) {
  const prev = useRef(cents);
  const [flash, setFlash] = useState("");
  useEffect(() => {
    const from = prev.current;
    prev.current = cents;
    if (from === cents) return;
    setFlash(cents > from ? "tick-up" : "tick-down");
    const t = window.setTimeout(() => setFlash(""), 900);
    return () => window.clearTimeout(t);
  }, [cents]);

  const cols = rackColumns(cents, compact ? 8 : 10);
  const size = compact ? 26 : 34;
  return (
    <div className={`chip-rack ${compact ? "compact" : ""} ${highlight ? "you-rack" : ""} ${flash}`}>
      <div className="chip-rack-cols">
        {cols.length === 0 ? (
          <div className="chip-rack-empty">—</div>
        ) : (
          cols.map((col) => (
            <ChipStack
              key={col.denom}
              cents={col.denom * col.count}
              size={size}
              maxChips={col.count}
              showTotal={false}
            />
          ))
        )}
      </div>
      <div className="chip-rack-meta">
        {label && <span className="chip-rack-label">{label}</span>}
        <strong className={flash}>{money(cents)}</strong>
      </div>
    </div>
  );
}

export function FeltSpot({
  cents,
  caption,
  winning,
  size = 36,
}: {
  cents: number;
  caption?: string;
  winning?: boolean;
  size?: number;
}) {
  return (
    <div className="felt-spot">
      <div className="felt-spot-ring">
        {cents > 0 ? (
          <ChipStack cents={cents} size={size} showTotal={false} winning={winning} />
        ) : null}
      </div>
      {caption && <div className="felt-spot-cap">{caption}</div>}
      {cents > 0 && <div className="chip-stack-total">{money(cents)}</div>}
    </div>
  );
}

/**
 * Re-shows a result that already settled. Clearly labelled, closable, hides itself.
 * Never plays payout effects and never moves chips.
 */
export function ReplayCard({ children, onClose, cageHref, autoHideMs = 9000 }: {
  children: ReactNode; onClose: () => void; cageHref?: string | null; autoHideMs?: number;
}) {
  useEffect(() => {
    if (!autoHideMs) return;
    const t = window.setTimeout(onClose, autoHideMs);
    return () => window.clearTimeout(t);
  }, [autoHideMs, onClose]);
  return (
    <div className="replay-card" role="status" aria-live="polite">
      <div className="replay-card-top">
        <span className="rl-replay-tag">Replay · already settled</span>
        <button type="button" className="replay-x" onClick={onClose} aria-label="Close replay">×</button>
      </div>
      {children}
      <div className="replay-card-foot">
        <span className="muted">From your ledger. No chips moved.</span>
        {cageHref ? <a className="cage-link" href={cageHref}>View in Cage →</a> : null}
      </div>
    </div>
  );
}

export function cageHref(game: string, ref: string | null | undefined) {
  return ref ? `/wallet?game=${encodeURIComponent(game)}&ref=${encodeURIComponent(ref)}#ledger` : null;
}

type Recent = { ref: string; at: string; netCents: number | null; paidCents: number; label: string };

/** Compact "Last 5" strip, straight from the ledger. Each pill opens those lines in the Cage. */
export function ResultsStrip({ game, refreshKey }: { game: string; refreshKey?: unknown }) {
  const [items, setItems] = useState<Recent[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/replay?game=${game}&recent=5`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (live && d) setItems(d.recent || []); }).catch(() => null);
    return () => { live = false; };
  }, [game, refreshKey]);
  if (!items || !items.length) return null;
  return (
    <div className="results-strip" aria-label="Your last results, from the ledger">
      <span className="results-strip-k">Last {items.length}</span>
      {items.map((r) => {
        const craps = r.netCents == null;
        const tone = craps ? (r.paidCents > 0 ? "up" : "flat") : r.netCents! > 0 ? "up" : r.netCents! < 0 ? "down" : "flat";
        const text = craps
          ? `Roll ${r.label}${r.paidCents > 0 ? ` · +${money(r.paidCents)}` : ""}`
          : r.netCents === 0 ? "Push" : `${r.netCents! > 0 ? "+" : "−"}${money(Math.abs(r.netCents!))}`;
        const aria = craps ? `Rolled ${r.label}, paid ${money(r.paidCents)}` : r.netCents === 0 ? "Push" : `${r.netCents! > 0 ? "Won" : "Lost"} ${money(Math.abs(r.netCents!))}`;
        return <a key={r.ref} className={`rs-pill ${tone}`} href={cageHref(game, r.ref) || "#"} aria-label={`${aria}. View in Cage`}>{text}</a>;
      })}
    </div>
  );
}

/** "Replay last result" button that swaps for an honest ReplayCard. Fetches the settled result from the ledger. */
export function TableReplay({ game, show, resetKey, render }: {
  game: string; show: boolean; resetKey?: unknown; render: (last: any) => ReactNode;
}) {
  const [last, setLast] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const close = useCallback(() => setLast(null), []);
  useEffect(() => { setLast(null); setMsg(null); }, [resetKey]);
  const hasPlayed = useHasPlayed(game, resetKey);
  if (!show || !hasPlayed) return null;
  async function open() {
    setMsg(null);
    try {
      const r = await fetch(`/api/replay?game=${game}`, { credentials: "same-origin" });
      const d = await r.json();
      if (!d.last) { setMsg("No settled result to replay yet."); return; }
      setLast(d.last);
    } catch { setMsg("Couldn't load the last result."); }
  }
  if (last) return <ReplayCard onClose={close} cageHref={cageHref(game, last.ref)}>{render(last)}</ReplayCard>;
  return (
    <>
      <button type="button" className="rl-replay" onClick={open}>↺ Replay last result</button>
      {msg && <span className="muted" style={{ fontSize: 12 }}>{msg}</span>}
    </>
  );
}

/** True once the ledger shows at least one settled result for this game. Hides replay for brand-new players. */
export function useHasPlayed(game: string, refreshKey?: unknown) {
  const [has, setHas] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/replay?game=${game}&recent=1`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (live && d) setHas((d.recent || []).length > 0); }).catch(() => null);
    return () => { live = false; };
  }, [game, refreshKey]);
  return has;
}

/** How-to-play coach card: opens on a player's first visit to a table, then folds into a small
 *  "How to play · odds" button so the rules and published RTP/house edge stay one tap away. */
export function FirstVisitTip({ game }: { game: string }) {
  const tip = TABLE_TIPS[game];
  const key = `pit_tip_v1:${game}`;
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem(key)) { setOpen(true); setFirst(true); } } catch {}
    setReady(true);
  }, [key]);
  if (!tip || !ready) return null;
  if (!open) {
    return (
      <button type="button" className="tip-reopen" aria-expanded={false} onClick={() => { setFirst(false); setOpen(true); recordAchievement({ kind: "coach" }); }}>
        <span aria-hidden="true">?</span> How to play · odds
      </button>
    );
  }
  const close = () => { try { localStorage.setItem(key, "1"); } catch {} recordAchievement({ kind: "coach" }); setOpen(false); };
  return (
    <aside className="first-tip" role="note" aria-label={tip.title}>
      <div className="first-tip-k">{first ? "First time here" : "How to play"}</div>
      <b>{tip.title}</b>
      <ol>{tip.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      <HowItPlays game={game} variant="first" />
      <p className="first-tip-odds"><span className="first-tip-odds-k">The odds</span> {tip.odds}</p>
      <div className="first-tip-row">
        <button type="button" className="btn first-tip-ok" onClick={close}>Got it</button>
        <Link className="first-tip-rules" href={rulesHref(game)}>Full rules &amp; odds</Link>
      </div>
      <small className="first-tip-note">Sandbox / test chips. No real money.</small>
    </aside>
  );
}

/** Clears a table's stale error once the balance moves (for example after Add chips). */
export function useClearErrOnBalance(setErr: (v: string | null) => void) {
  const { user } = useUser();
  const bal = user?.balanceCents;
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } setErr(null); }, [bal]); // eslint-disable-line react-hooks/exhaustive-deps
}
