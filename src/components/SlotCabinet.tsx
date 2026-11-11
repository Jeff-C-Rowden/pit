"use client";
/**
 * Physical slot-cabinet chrome shared by Gilded Track and Canopy Spire: lit topper with
 * chasing bulbs, beveled cabinet with side light strips, recessed drum reels behind glass,
 * payline tabs, belly glass, button deck with LED meters, and a pull handle.
 * Original CSS/SVG art. Purely presentational: results, odds and paytables come from the
 * server; lights react only after the reels have settled (never during a spin).
 */
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { autoNext, autoStopText, CAB_AUTO_SPINS, leverFires, leverTravel, ledText, paylineTabs } from "@/lib/cabinet";

const uid = (raw: string) => raw.replace(/[^a-zA-Z0-9]/g, "");

/* ---------------- bulbs ---------------- */

function BulbRow({ n, side }: { n: number; side: "t" | "b" | "l" | "r" }) {
  return (
    <span className={`cab-bulbs cab-bulbs-${side}`} aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={`cab-bulb ph${i % 3}`} />
      ))}
    </span>
  );
}

/* ---------------- topper ---------------- */

export function CabinetTopper({ title, kicker, emblem, children }: { title: string; kicker?: string; emblem?: ReactNode; children?: ReactNode }) {
  const id = uid(useId());
  return (
    <div className="cab-topper">
      <svg className="cab-crest" viewBox="0 0 320 46" preserveAspectRatio="none" aria-hidden focusable="false">
        <defs>
          <linearGradient id={`cg${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff3b0" /><stop offset=".45" stopColor="#f5c542" /><stop offset="1" stopColor="#7a4a0a" />
          </linearGradient>
        </defs>
        <path d="M0 46 L0 30 Q40 30 70 18 Q110 2 160 2 Q210 2 250 18 Q280 30 320 30 L320 46 Z" fill={`url(#cg${id})`} />
        <path d="M6 46 L6 34 Q44 34 74 22 Q112 8 160 8 Q208 8 246 22 Q276 34 314 34 L314 46 Z" fill="#5a0208" />
      </svg>
      {emblem && <span className="cab-emblem" aria-hidden>{emblem}</span>}
      <div className="cab-sign">
        <BulbRow n={16} side="t" />
        <BulbRow n={16} side="b" />
        <BulbRow n={3} side="l" />
        <BulbRow n={3} side="r" />
        <div className="cab-sign-face">
          {kicker && <span className="cab-sign-kicker">{kicker}</span>}
          <span className="cab-sign-title">{title}</span>
        </div>
      </div>
      {children && <div className="cab-topper-meters">{children}</div>}
    </div>
  );
}

/* ---------------- belly glass ---------------- */

export type BellyPay = { key: string; label: string; tone: string; Svg: () => ReactNode; pay5: number };

export function CabinetBelly({ pays, note }: { pays: BellyPay[]; note: ReactNode }) {
  return (
    <div className="cab-belly">
      <div className="cab-belly-glass">
        {pays.length > 0 && (
          <ul className="cab-belly-pays" aria-label="Top pays, five of a kind, times coin">
            {pays.map((p) => {
              const I = p.Svg;
              return (
                <li key={p.key}>
                  <span className={`cab-belly-ico tone-${p.tone}`} aria-hidden><I /></span>
                  <span className="cab-belly-five">5×</span>
                  <span className="cab-belly-lbl">{p.label}</span>
                  <b>{p.pay5.toLocaleString("en-US")}</b>
                </li>
              );
            })}
          </ul>
        )}
        <p className="cab-belly-note">{note}</p>
      </div>
    </div>
  );
}

/* ---------------- button deck ---------------- */

export function CabinetLed({ label, cents, value, lit }: { label: string; cents?: number; value?: ReactNode; lit?: boolean }) {
  return (
    <div className={`cab-led${lit ? " lit" : ""}`}>
      <span className="cab-led-lbl">{label}</span>
      <span className="cab-led-val">
        <span className="cab-led-ghost" aria-hidden>888,888.88</span>
        <span className="cab-led-num">{value ?? ledText(cents ?? 0)}</span>
      </span>
    </div>
  );
}

export function CabinetDeck({
  creditCents,
  betCents,
  win,
  winLit,
  spinning,
  busy,
  canBetDown,
  canBetUp,
  onBetDown,
  onBetUp,
  onMax,
  maxArmed,
  onSpin,
  auto,
  note,
}: {
  creditCents: number;
  betCents: number;
  win: ReactNode;
  winLit: boolean;
  spinning: boolean;
  busy: boolean;
  canBetDown: boolean;
  canBetUp: boolean;
  onBetDown: () => void;
  onBetUp: () => void;
  onMax: () => void;
  maxArmed: boolean;
  onSpin: () => void;
  auto: AutoSpin;
  note?: ReactNode;
}) {
  const locked = busy || spinning || auto.running;
  return (
    <div className="cab-deck">
      <div className="cab-leds" aria-live="polite">
        <CabinetLed label="Credit" cents={creditCents} />
        <CabinetLed label="Bet" cents={betCents} />
        <CabinetLed label="Win" value={win} lit={winLit} />
      </div>
      <div className="cab-buttons" role="group" aria-label="Cabinet buttons">
        <button type="button" className="cab-btn cab-btn-red" onClick={onBetDown} disabled={locked || !canBetDown} aria-label="Bet down one coin size">
          <span className="cab-btn-cap">Bet −</span>
        </button>
        <button type="button" className="cab-btn cab-btn-red" onClick={onBetUp} disabled={locked || !canBetUp} aria-label="Bet up one coin size">
          <span className="cab-btn-cap">Bet +</span>
        </button>
        <button type="button" className={`cab-btn cab-btn-amber${maxArmed ? " armed" : ""}`} onClick={onMax} disabled={locked}>
          <span className="cab-btn-cap">{maxArmed ? "Confirm max" : "Max bet"}</span>
        </button>
        <button
          type="button"
          className={`cab-btn cab-btn-blue${auto.running ? " on" : ""}`}
          onClick={auto.running ? auto.cancel : auto.start}
          disabled={!auto.running && (busy || spinning)}
          data-cab-auto
          aria-pressed={auto.running}
          aria-label={auto.running ? `Stop Auto, ${auto.left} spins left` : `Auto: play ${CAB_AUTO_SPINS} spins at this bet`}
        >
          <span className="cab-btn-cap">{auto.running ? `Stop ${auto.left}` : `Auto ${CAB_AUTO_SPINS}`}</span>
        </button>
        <button
          type="button"
          data-cab-spin
          className={`cab-btn cab-btn-spin${spinning ? " stop" : ""}`}
          onClick={onSpin}
          disabled={busy && !spinning}
          aria-label={spinning ? "Stop reels" : "Spin"}
        >
          <span className="cab-btn-cap">{spinning ? "Stop" : "Spin"}</span>
        </button>
      </div>
      {auto.note && <p className="cab-auto-note" role="status">{auto.note}</p>}
      {note && <p className="cab-deck-note">{note}</p>}
    </div>
  );
}

/* ---------------- pull handle ---------------- */

export function CabinetLever({ onPull, disabled, reduced }: { onPull: () => void; disabled: boolean; reduced: boolean }) {
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<"rest" | "drag" | "fire" | "return">("rest");
  const start = useRef<{ y: number; travel: number } | null>(null);
  const skipClick = useRef(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const fire = useCallback(() => {
    if (disabled) return;
    setPhase("fire");
    setPull(1);
    const downMs = reduced ? 0 : 170;
    timers.current.push(window.setTimeout(() => {
      onPull();
      setPhase("return");
      setPull(0);
      timers.current.push(window.setTimeout(() => setPhase("rest"), reduced ? 0 : 520));
    }, downMs));
  }, [disabled, onPull, reduced]);

  return (
    <div className={`cab-lever ph-${phase}${disabled ? " is-disabled" : ""}`} style={{ ["--pull" as string]: pull } as CSSProperties}>
      <span className="cab-lever-slot" aria-hidden />
      <button
        type="button"
        className="cab-lever-arm"
        aria-label="Pull the handle to spin"
        aria-disabled={disabled || undefined}
        title={disabled ? undefined : "Pull or tap to spin"}
        onPointerDown={(e) => {
          if (disabled) return;
          const h = (e.currentTarget.parentElement?.getBoundingClientRect().height ?? 160) * 0.9;
          start.current = { y: e.clientY, travel: h };
          skipClick.current = false;
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dy = e.clientY - s.y;
          if (Math.abs(dy) < 6 && phase !== "drag") return;
          setPhase("drag");
          setPull(leverTravel(dy, s.travel));
        }}
        onPointerUp={(e) => {
          const s = start.current;
          start.current = null;
          if (!s) return;
          const dy = e.clientY - s.y;
          if (Math.abs(dy) < 6) return; // a tap: the click handler pulls
          skipClick.current = true;
          if (leverFires(dy, s.travel, dy)) fire();
          else { setPhase("return"); setPull(0); timers.current.push(window.setTimeout(() => setPhase("rest"), 400)); }
        }}
        onPointerCancel={() => { start.current = null; setPhase("return"); setPull(0); }}
        onClick={() => {
          if (skipClick.current) { skipClick.current = false; return; }
          fire();
        }}
      >
        <span className="cab-lever-rod" aria-hidden>
          <span className="cab-lever-ball" />
        </span>
      </button>
      <span className="cab-lever-hub" aria-hidden />
    </div>
  );
}

/* ---------------- Auto ---------------- */

export type AutoSpin = { running: boolean; left: number; note: string | null; start: () => void; cancel: () => void; fail: () => void };

/**
 * Short fixed Auto run. Each spin goes through the page's normal spin path (server checks
 * balance, limits, pause, exclusion). Stops on any refusal, a jackpot, too few chips,
 * the player pressing Stop, or the tab being hidden.
 */
export function useAutoSpin({
  settleTick,
  spinOnce,
  balanceCents,
  costCents,
  jackpot,
}: {
  /** Increments once each time the reels settle. */
  settleTick: number;
  spinOnce: () => void;
  balanceCents: () => number;
  costCents: number;
  jackpot: () => boolean;
}): AutoSpin {
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const runRef = useRef(false);
  const leftRef = useRef(0);
  const spinRef = useRef(spinOnce);
  spinRef.current = spinOnce;
  const timer = useRef<number | null>(null);

  const stop = useCallback((text: string | null) => {
    runRef.current = false;
    leftRef.current = 0;
    setRunning(false);
    setLeft(0);
    setNote(text);
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
  }, []);

  const start = useCallback(() => {
    if (runRef.current) return;
    if (balanceCents() < costCents) { setNote(autoStopText("funds")); return; }
    runRef.current = true;
    leftRef.current = CAB_AUTO_SPINS - 1;
    setRunning(true);
    setLeft(CAB_AUTO_SPINS - 1);
    setNote(null);
    spinRef.current();
  }, [balanceCents, costCents]);

  const lastTick = useRef(settleTick);
  useEffect(() => {
    if (settleTick === lastTick.current) return;
    lastTick.current = settleTick;
    if (!runRef.current) return;
    const d = autoNext({ remaining: leftRef.current, balanceCents: balanceCents(), costCents, error: false, jackpot: jackpot(), cancelled: false, realityDue: !!document.querySelector(".reality-note") });
    if (!d.go) { stop(autoStopText(d.reason)); return; }
    leftRef.current -= 1;
    setLeft(leftRef.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (runRef.current) spinRef.current();
    }, 900);
  }, [settleTick, balanceCents, costCents, jackpot, stop]);

  useEffect(() => {
    const onVis = () => { if (document.hidden && runRef.current) stop(autoStopText("cancelled")); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); if (timer.current) window.clearTimeout(timer.current); };
  }, [stop]);

  return {
    running,
    left,
    note,
    start,
    cancel: () => stop(autoStopText("cancelled")),
    fail: () => { if (runRef.current) stop(autoStopText("error")); },
  };
}

/* ---------------- the cabinet itself ---------------- */

export function CabinetChrome({
  themeClass,
  glow,
  glowLive,
  spinning,
  settled,
  symH,
  topper,
  belly,
  deck,
  lever,
  paylines,
  winLines,
  windowLabel,
  kick,
  children,
}: {
  themeClass: string;
  glow: number;
  glowLive: boolean;
  spinning: boolean;
  settled: boolean;
  symH: number;
  topper: ReactNode;
  belly?: ReactNode;
  deck?: ReactNode;
  lever?: ReactNode;
  paylines: readonly (readonly number[])[];
  /** 0-based winning lines; lit only once the reels have settled. */
  winLines?: number[];
  windowLabel: string;
  kick: string[];
  children: ReactNode;
}) {
  const after = settled && !spinning;
  const g = after ? glow : 0;
  const lit = new Set(after ? (winLines ?? []).map((l) => l + 1) : []);
  const tabs = (side: "left" | "right") => (
    <div className={`cab-tabs cab-tabs-${side}`} aria-hidden>
      {paylineTabs(paylines, side).map((nums, row) => (
        <div key={row} className="cab-tab-row">
          {nums.map((n) => <span key={n} className={`cab-tab${lit.has(n) ? " lit" : ""}`}>{n}</span>)}
        </div>
      ))}
    </div>
  );
  return (
    <div className={`cab-wrap${lever ? " has-lever" : ""}`}>
      <div
        className={`slot-cabinet cab ${themeClass}${spinning ? " is-spinning" : " is-idle"}${g > 0 ? ` glow-t${g}${glowLive ? " glow-live" : ""}` : ""}`}
        data-glow={g}
        style={{ ["--sym-h" as string]: `${symH}px` }}
      >
        <div className="slot-win-halo" aria-hidden />
        {topper}
        <div className="cab-body">
          <span className="cab-strip cab-strip-l" aria-hidden><i /><i /><i /><i /><i /><i /><i /></span>
          <div className="cab-bezel">
            {tabs("left")}
            <div className="slot-window cab-window" role="img" aria-label={windowLabel}>
              {children}
              <span className="cab-drum" aria-hidden />
              <span className="cab-payline" aria-hidden />
              <div className="slot-glass cab-glass" aria-hidden />
            </div>
            {tabs("right")}
          </div>
          <span className="cab-strip cab-strip-r" aria-hidden><i /><i /><i /><i /><i /><i /><i /></span>
          {lever}
        </div>
        {belly}
        {deck}
        <div className="cab-base" aria-hidden>
          {kick.map((k, i) => (
            <span key={k}>{i > 0 && <i className="slot-kick-dot" />}{k}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
