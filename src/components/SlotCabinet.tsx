"use client";
/**
 * Classic upright slot-cabinet chrome shared by Sundown Trail, Antler Ridge and Buckshot Bars:
 * green pinstriped cabinet with brass rails, a title band with marquee bulbs, LOBBY and sound
 * pills, an info strip, chrome-framed ivory reels with a payline arrow tab, red LED meters and
 * beige keycaps on a brass console, plus a pull handle.
 * Original CSS/SVG art. Purely presentational: results, odds and paytables come from the
 * server; lights react only after the reels have settled (never during a spin).
 */
import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { autoNext, autoStopText, CAB_AUTO_SPINS, leverFires, leverTravel, ledText, paylineTabs } from "@/lib/cabinet";
import { playChip, setSoundOn, soundOn } from "@/lib/feel";

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

function SoundPill() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(soundOn());
    const f = () => setOn(soundOn());
    window.addEventListener("pit-sound", f);
    return () => window.removeEventListener("pit-sound", f);
  }, []);
  return (
    <button type="button" className={`cab-pill cab-sound${on ? " on" : ""}`} aria-pressed={on} aria-label={`Sound ${on ? "on" : "off"}`} onClick={() => { setSoundOn(!on); if (!on) setTimeout(playChip, 30); }}>
      {on ? "ON" : "OFF"}
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />{on && <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />}</svg>
    </button>
  );
}

export function CabinetTopper({ title, kicker, emblem, info, children }: { title: string; kicker?: string; emblem?: ReactNode; info?: ReactNode; children?: ReactNode }) {
  return (
    <div className="cab-topper">
      <div className="cab-topbar">
        <Link href="/floor" className="cab-pill cab-lobby">LOBBY</Link>
        <SoundPill />
      </div>
      <div className="cab-sign">
        <BulbRow n={14} side="t" />
        <div className="cab-sign-face">
          {emblem && <span className="cab-emblem" aria-hidden>{emblem}</span>}
          <span className="cab-sign-title">{title}</span>
          {kicker && <span className="cab-sign-kicker">{kicker}</span>}
        </div>
      </div>
      {info && <div className="cab-info" role="note"><span>{info}</span><span className="cab-info-i" aria-hidden>i</span></div>}
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

export function CabinetLed({ label, cents, value, lit, tone = "red" }: { label: string; cents?: number; value?: ReactNode; lit?: boolean; tone?: "red" | "blue" }) {
  return (
    <div className={`cab-led cab-led-${tone}${lit ? " lit" : ""}`}>
      <span className="cab-led-lbl">{label}</span>
      <span className="cab-led-val">
        <span className="cab-led-ghost" aria-hidden>888,888.88</span>
        <span className="cab-led-num">{value ?? ledText(cents ?? 0)}</span>
      </span>
    </div>
  );
}

/** A beige 3D keycap on its bronze collar. */
export function CabinetKey({ children, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button type="button" className={`cab-key ${className}`} {...rest}>
      <span className="cab-key-cap">{children}</span>
    </button>
  );
}

export function CabinetDeck({
  creditCents,
  betCents,
  win,
  winLit,
  paidCents,
  coinLabel,
  spinning,
  busy,
  canBetDown,
  canBetUp,
  onBetDown,
  onBetUp,
  onBetOne,
  onMax,
  maxArmed,
  onSpin,
  onPayTable,
  auto,
  note,
  fine = "Malfunction voids all spins · sandbox chips, no cash value",
  maxLabel = "Play max",
}: {
  creditCents: number;
  betCents: number;
  win: ReactNode;
  winLit: boolean;
  /** Total paid on this machine this visit. */
  paidCents?: number;
  /** Coin value shown on the plate and between the − / + rocker. */
  coinLabel?: string;
  spinning: boolean;
  busy: boolean;
  canBetDown: boolean;
  canBetUp: boolean;
  onBetDown: () => void;
  onBetUp: () => void;
  onBetOne?: () => void;
  onMax: () => void;
  maxArmed: boolean;
  onSpin: () => void;
  onPayTable?: () => void;
  auto: AutoSpin;
  note?: ReactNode;
  fine?: ReactNode;
  maxLabel?: string;
}) {
  const locked = busy || spinning || auto.running;
  return (
    <div className="cab-deck">
      <div className="cab-meters" aria-live="polite">
        <div className="cab-credits">
          <CabinetLed label="Total credits" cents={creditCents} tone="blue" />
          <p className="cab-fine">{fine}</p>
        </div>
        {coinLabel && <div className="cab-coin-plate" aria-label={`Coin value ${coinLabel}`}>{coinLabel}</div>}
        <CabinetLed label="Bet" cents={betCents} />
        <CabinetLed label="Win" value={win} lit={winLit} />
        <CabinetLed label="Paid" cents={paidCents ?? 0} />
      </div>
      <div className="cab-console" role="group" aria-label="Cabinet buttons">
        <CabinetKey className="cab-key-pay" onClick={onPayTable} disabled={!onPayTable}>Pay<br />table</CabinetKey>
        <CabinetKey
          className={`cab-key-auto${auto.running ? " on" : ""}`}
          onClick={auto.running ? auto.cancel : auto.start}
          disabled={!auto.running && (busy || spinning)}
          data-cab-auto
          aria-pressed={auto.running}
          aria-label={auto.running ? `Stop Auto, ${auto.left} spins left` : `Auto: play ${CAB_AUTO_SPINS} spins at this bet`}
        >
          {auto.running ? <>Stop<br />{auto.left}</> : <>Auto<br />play</>}
        </CabinetKey>
        <div className="cab-rocker" role="group" aria-label="Coin value">
          <button type="button" className="cab-rock cab-rock-dn" onClick={onBetDown} disabled={locked || !canBetDown} aria-label="Coin value down">−</button>
          <span className="cab-denom">{coinLabel ?? ""}</span>
          <button type="button" className="cab-rock cab-rock-up" onClick={onBetUp} disabled={locked || !canBetUp} aria-label="Coin value up">+</button>
        </div>
        <CabinetKey className="cab-key-one" onClick={onBetOne ?? onBetUp} disabled={locked || (!onBetOne && !canBetUp)}>Bet<br />one</CabinetKey>
        <CabinetKey
          data-cab-spin
          className={`cab-key-spin${spinning ? " stop" : ""}`}
          onClick={onSpin}
          disabled={busy && !spinning}
          aria-label={spinning ? "Stop reels" : "Spin"}
        >
          {spinning ? <>Stop<br />reels</> : <>Spin<br />reels</>}
        </CabinetKey>
        <CabinetKey className={`cab-key-max${maxArmed ? " armed" : ""}`} onClick={onMax} disabled={locked}>
          {maxArmed ? <>Confirm<br />max</> : <>{maxLabel.split(" ")[0]}<br />{maxLabel.split(" ").slice(1).join(" ")}</>}
        </CabinetKey>
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
  singleLine,
  side,
  children,
}: {
  /** One centre payline: show a PAYLINE arrow tab instead of numbered tabs. */
  singleLine?: boolean;
  /** Optional right-hand column inside the cabinet (e.g. a PLAY 3 COINS sign). */
  side?: ReactNode;
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
          <div className={`cab-bezel${singleLine ? " single" : ""}${side ? " has-side" : ""}`}>
            {singleLine ? <span className={`cab-payline-tab${lit.size ? " lit" : ""}`} aria-hidden>Payline</span> : tabs("left")}
            <div className="slot-window cab-window" role="img" aria-label={windowLabel}>
              {children}
              <span className="cab-drum" aria-hidden />
              <span className="cab-payline" aria-hidden />
              <div className="slot-glass cab-glass" aria-hidden />
            </div>
            {singleLine ? null : tabs("right")}
            {side && <div className="cab-side">{side}</div>}
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
