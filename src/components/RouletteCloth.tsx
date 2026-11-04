"use client";
import { shouldSwallowClick } from "@/lib/tapGuard";
import type React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChipStack } from "./TableUX";
import { SeatAvatar } from "./Seating";
import { money } from "./useUser";
import { DIAMONDS, FPS, R_DEFLECT, type Frame, type SpinPlan } from "@/lib/games/rouletteBall";
import { RED, WHEEL_ORDER as WHEEL, FELT_ROWS, pocketColor, coveredBy } from "@/lib/games/rouletteFelt";
export { RED, FELT_ROWS, pocketColor, WHEEL };

/** Smooth casino spin — ball arcs then settles with the cylinder. */
export const SPIN_MS = 3000;

export type ClothBet = {
  kind: string;
  numbers?: string[];
  which?: number;
  label: string;
};

export type GhostChip = { label: string; cents: number; bot?: string };

/** House bots that linger at the American table — Pit names only. */
export const PIT_ROULETTE_BOTS = ["Mara", "Vince", "Delia", "Otto", "June"] as const;

function OnChip({ cents, ghost, paid }: { cents: number; ghost?: boolean; paid?: boolean | null }) {
  if (cents <= 0) return null;
  return (
    <span key={cents} className={`chip-on-num${ghost ? " rl-bot-chip" : " rl-mine"}${paid === true ? " paid" : paid === false ? " lost" : ""}`}>
      <ChipStack cents={cents} size={ghost ? 22 : 26} maxChips={ghost ? 2 : 4} showTotal={false} />
      {!ghost && <span className="rl-bet-amt">{money(cents)}</span>}
    </span>
  );
}

function Diamond({ color }: { color: "red" | "black" }) {
  return (
    <span className={`rl-diamond ${color}`} aria-hidden>
      ◆
    </span>
  );
}

function sectorPath(cx: number, cy: number, r0: number, r1: number, a0deg: number, a1deg: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a0 = rad(a0deg);
  const a1 = rad(a1deg);
  const p = (r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  const [x0i, y0i] = p(r0, a0);
  const [x0o, y0o] = p(r1, a0);
  const [x1i, y1i] = p(r0, a1);
  const [x1o, y1o] = p(r1, a1);
  const large = a1deg - a0deg > 180 ? 1 : 0;
  return `M ${x0i.toFixed(2)} ${y0i.toFixed(2)} L ${x0o.toFixed(2)} ${y0o.toFixed(2)} A ${r1} ${r1} 0 ${large} 1 ${x1o.toFixed(2)} ${y1o.toFixed(2)} L ${x1i.toFixed(2)} ${y1i.toFixed(2)} A ${r0} ${r0} 0 ${large} 0 ${x0i.toFixed(2)} ${y0i.toFixed(2)} Z`;
}

function LastNine({ pockets }: { pockets: string[] }) {
  return (
    <div className="rl-last9" aria-label="Last nine numbers">
      {Array.from({ length: 9 }, (_, i) => {
        const p = pockets[i];
        if (!p) return <span key={`e${i}`} className="rl-last9-pip empty" />;
        return (
          <span key={`${p}-${i}`} className={`rl-last9-pip chip ${pocketColor(p)} ${i === 0 ? "newest" : ""}`}>
            {p}
          </span>
        );
      })}
    </div>
  );
}

export function tallySession(pockets: string[]) {
  const dozens = [0, 0, 0];
  let red = 0, black = 0, green = 0, even = 0, odd = 0, low = 0, high = 0;
  const freq = new Map<string, { n: number; recency: number }>();
  pockets.forEach((p, i) => {
    const prev = freq.get(p);
    freq.set(p, { n: (prev?.n || 0) + 1, recency: prev ? prev.recency : i });
    if (p === "0" || p === "00") {
      green += 1;
      return;
    }
    const n = Number(p);
    if (n >= 1 && n <= 12) dozens[0]! += 1;
    else if (n <= 24) dozens[1]! += 1;
    else dozens[2]! += 1;
    const c = pocketColor(p);
    if (c === "red") red += 1;
    else if (c === "black") black += 1;
    if (n % 2 === 0) even += 1;
    else odd += 1;
    if (n <= 18) low += 1;
    else high += 1;
  });
  const hot = [...freq.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].recency - b[1].recency)
    .slice(0, 5)
    .map(([p, v]) => ({ pocket: p, hits: v.n }));
  return { spins: pockets.length, dozens, red, black, green, even, odd, low, high, hot };
}

export function RouletteStats({ pockets }: { pockets: string[] }) {
  const s = useMemo(() => tallySession(pockets), [pockets]);
  return (
    <aside className="rl-stats" aria-label="Session statistics from last numbers">
      <div className="rl-stats-h">Session · {s.spins} spin{s.spins === 1 ? "" : "s"}</div>
      <div className="rl-stats-colors">
        <span className="rl-stat-pill red"><em>Red</em><strong>{s.red}</strong></span>
        <span className="rl-stat-pill black"><em>Black</em><strong>{s.black}</strong></span>
        <span className="rl-stat-pill green"><em>0 / 00</em><strong>{s.green}</strong></span>
      </div>
      <div className="rl-stats-grid">
        <div>
          <div className="rl-stats-row"><span>1st 12</span><strong>{s.dozens[0]}</strong></div>
          <div className="rl-stats-row"><span>2nd 12</span><strong>{s.dozens[1]}</strong></div>
          <div className="rl-stats-row"><span>3rd 12</span><strong>{s.dozens[2]}</strong></div>
        </div>
        <div>
          <div className="rl-stats-row"><span>Even</span><strong>{s.even}</strong></div>
          <div className="rl-stats-row"><span>Odd</span><strong>{s.odd}</strong></div>
          <div className="rl-stats-row"><span>1–18</span><strong>{s.low}</strong></div>
          <div className="rl-stats-row"><span>19–36</span><strong>{s.high}</strong></div>
        </div>
      </div>
      <div className="rl-hot">
        <span className="rl-hot-lab">Hottest</span>
        {s.hot.length === 0 ? (
          <span className="muted">—</span>
        ) : (
          s.hot.map((h) => (
            <span key={h.pocket} className={`rl-last9-pip chip ${pocketColor(h.pocket)}`} title={`${h.hits} hit${h.hits === 1 ? "" : "s"}`}>
              {h.pocket}
            </span>
          ))
        )}
      </div>
    </aside>
  );
}

export function RouletteBots({
  active,
  flashes,
}: {
  active?: boolean;
  flashes?: { bot: string; label: string }[];
}) {
  const bots = PIT_ROULETTE_BOTS;
  return (
    <div className={`rl-bots${active ? " live" : ""}`} aria-label="House bots at the table">
      {bots.map((name) => {
        const flash = flashes?.find((f) => f.bot === name);
        return (
          <div key={name} className={`rl-bot${flash ? " betting" : ""}`}>
            <SeatAvatar name={name} size={34} />
            <div className="rl-bot-meta">
              <span className="rl-bot-name">{name}</span>
              {flash ? (
                <span className="rl-bot-flash" key={`${flash.label}-${flash.bot}`}>
                  {flash.label}
                </span>
              ) : (
                <span className="rl-bot-idle">{active ? "watching" : "at table"}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RouletteWheel({
  pocket,
  spinning,
  plan,
  instant = false,
}: {
  pocket?: string | null;
  spinning?: boolean;
  /** Precomputed physics run that ends in the server's pocket. */
  plan?: SpinPlan | null;
  /** Skip / reduced motion: jump straight to the settled frame. */
  instant?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const n = WHEEL.length;
  const slice = 360 / n;
  const cylRef = useRef<HTMLDivElement | null>(null);
  const ballRef = useRef<SVGCircleElement | null>(null);
  const shadowRef = useRef<SVGCircleElement | null>(null);
  const cx = 220;
  const cy = 220;
  const r0 = 72;
  const r1 = 188;

  useEffect(() => {
    if (!plan) return;
    const draw = (f: Frame | undefined) => {
      if (!f) return;
      if (cylRef.current) cylRef.current.style.transform = `rotate(${f.rotor.toFixed(3)}deg)`;
      const a = (f.ball * Math.PI) / 180;
      const x = cx + f.r * Math.sin(a);
      const y = cy - f.r * Math.cos(a);
      const lift = Math.min(f.lift, 14);
      if (ballRef.current) {
        ballRef.current.setAttribute("cx", x.toFixed(2));
        ballRef.current.setAttribute("cy", (y - lift * 0.6).toFixed(2));
        ballRef.current.setAttribute("r", (7 + lift * 0.08).toFixed(2));
      }
      if (shadowRef.current) {
        shadowRef.current.setAttribute("cx", (x + 1.5 + lift * 0.3).toFixed(2));
        shadowRef.current.setAttribute("cy", (y + 2 + lift * 0.3).toFixed(2));
        shadowRef.current.setAttribute("opacity", (0.5 - lift * 0.02).toFixed(2));
      }
    };
    const frames = plan.frames;
    if (instant || !spinning) { draw(frames[frames.length - 1]!); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const i = Math.min(frames.length - 1, Math.floor(((now - t0) / 1000) * FPS));
      draw(frames[i]!);
      if (i < frames.length - 1) raf = requestAnimationFrame(tick);
    };
    draw(frames[0]!);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [plan, instant, spinning]);

  const settled = !spinning && !!pocket;

  return (
    <div
      className={`rl-wheel-scene ${spinning ? "spinning" : ""} ${settled ? "settled" : ""} ${instant ? "instant" : ""}`}
    >
      <div className="rl-bowl">
        <svg viewBox="0 0 440 440" className="rl-bowl-svg" aria-hidden>
          <defs>
            <radialGradient id={`wood${uid}`} cx="36%" cy="28%" r="74%">
              <stop offset="0%" stopColor="#a06840" />
              <stop offset="22%" stopColor="#7a4a2c" />
              <stop offset="48%" stopColor="#4a2818" />
              <stop offset="72%" stopColor="#1e100a" />
              <stop offset="100%" stopColor="#3a2214" />
            </radialGradient>
            <linearGradient id={`brass${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f5e6c0" />
              <stop offset="35%" stopColor="#d4b24a" />
              <stop offset="70%" stopColor="#a07818" />
              <stop offset="100%" stopColor="#6a4a0c" />
            </linearGradient>
            <radialGradient id={`groove${uid}`} cx="50%" cy="48%" r="52%">
              <stop offset="70%" stopColor="#0c0806" />
              <stop offset="82%" stopColor="#2a1810" />
              <stop offset="90%" stopColor="#120c08" />
              <stop offset="100%" stopColor="#241610" />
            </radialGradient>
            <radialGradient id={`rimShine${uid}`} cx="30%" cy="22%" r="70%">
              <stop offset="0%" stopColor="rgba(255,220,170,.22)" />
              <stop offset="45%" stopColor="rgba(255,220,170,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,.35)" />
            </radialGradient>
          </defs>
          <circle cx="220" cy="220" r="218" fill={`url(#wood${uid})`} />
          <circle cx="220" cy="220" r="218" fill={`url(#rimShine${uid})`} />
          <circle cx="220" cy="220" r="204" fill="none" stroke={`url(#brass${uid})`} strokeWidth="12" />
          <circle cx="220" cy="220" r="194" fill="none" stroke="#8a6a20" strokeWidth="1.5" opacity="0.7" />
          <circle cx="220" cy="220" r="192" fill={`url(#groove${uid})`} />
          <circle cx="220" cy="220" r="186" fill="none" stroke="#e8d5a3" strokeWidth="2.2" opacity="0.75" />
          <circle cx="220" cy="220" r="64" fill="#0a0604" />
          {/* frets shadow ring */}
          <circle cx="220" cy="220" r="76" fill="none" stroke="rgba(0,0,0,.45)" strokeWidth="8" />
        </svg>

        <div
          className="rl-cylinder"
          ref={cylRef}
        >
          <svg viewBox="0 0 440 440" className="rl-wheel" aria-hidden>
            <defs>
              <linearGradient id={`pocketRed${uid}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#d42832" />
                <stop offset="55%" stopColor="#9a1218" />
                <stop offset="100%" stopColor="#5c0a0e" />
              </linearGradient>
              <linearGradient id={`pocketBlk${uid}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#2a2a2a" />
                <stop offset="55%" stopColor="#121212" />
                <stop offset="100%" stopColor="#050505" />
              </linearGradient>
              <linearGradient id={`pocketGrn${uid}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1a9a52" />
                <stop offset="55%" stopColor="#0c6a34" />
                <stop offset="100%" stopColor="#064020" />
              </linearGradient>
            </defs>
            {WHEEL.map((p, i) => {
              const a0 = i * slice - 90;
              const a1 = (i + 1) * slice - 90;
              const col = pocketColor(p);
              const fill =
                col === "green"
                  ? `url(#pocketGrn${uid})`
                  : col === "red"
                    ? `url(#pocketRed${uid})`
                    : `url(#pocketBlk${uid})`;
              const mid = ((i * slice + slice / 2 - 90) * Math.PI) / 180;
              const tx = cx + 132 * Math.cos(mid);
              const ty = cy + 132 * Math.sin(mid);
              const fret0 = (a0 * Math.PI) / 180;
              const fx0 = cx + r0 * Math.cos(fret0);
              const fy0 = cy + r0 * Math.sin(fret0);
              const fx1 = cx + r1 * Math.cos(fret0);
              const fy1 = cy + r1 * Math.sin(fret0);
              return (
                <g key={p + i}>
                  <path d={sectorPath(cx, cy, r0, r1, a0, a1)} fill={fill} stroke="#0a0604" strokeWidth="0.4" />
                  <line
                    x1={fx0.toFixed(2)}
                    y1={fy0.toFixed(2)}
                    x2={fx1.toFixed(2)}
                    y2={fy1.toFixed(2)}
                    stroke="#f0e0b0"
                    strokeWidth="1.35"
                    opacity="0.9"
                  />
                  <text
                    x={tx.toFixed(2)}
                    y={ty.toFixed(2)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#f8f0e0"
                    fontSize={p.length > 1 ? 12 : 14}
                    fontWeight="800"
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,.6)" }}
                    transform={`rotate(${i * slice + slice / 2}, ${tx.toFixed(2)}, ${ty.toFixed(2)})`}
                  >
                    {p}
                  </text>
                </g>
              );
            })}
            <circle cx="220" cy="220" r="72" fill="none" stroke="#c9a227" strokeWidth="3.5" />
            <circle cx="220" cy="220" r="68" fill="none" stroke="#e8d5a3" strokeWidth="1" opacity="0.4" />
          </svg>
        </div>

        <div className="rl-hub" aria-hidden>
          <svg viewBox="0 0 440 440">
            <defs>
              <radialGradient id={`cap${uid}`} cx="38%" cy="32%" r="68%">
                <stop offset="0%" stopColor="#4a3424" />
                <stop offset="55%" stopColor="#1a120c" />
                <stop offset="100%" stopColor="#080604" />
              </radialGradient>
              <linearGradient id={`hubBrass${uid}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f0e0b0" />
                <stop offset="50%" stopColor="#c9a227" />
                <stop offset="100%" stopColor="#7a5a10" />
              </linearGradient>
            </defs>
            {DIAMONDS.map((d) => {
              const a = (d * Math.PI) / 180;
              const x = 220 + R_DEFLECT * Math.sin(a);
              const y = 220 - R_DEFLECT * Math.cos(a);
              return (
                <polygon
                  key={d}
                  points="0,-7 3.2,0 0,7 -3.2,0"
                  transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${d})`}
                  fill={`url(#hubBrass${uid})`}
                  stroke="#5a400c"
                  strokeWidth="0.8"
                />
              );
            })}
            <circle cx="220" cy="220" r="64" fill={`url(#cap${uid})`} stroke={`url(#hubBrass${uid})`} strokeWidth="4.5" />
            <circle cx="220" cy="220" r="52" fill="none" stroke="#e8d5a3" strokeWidth="1.2" opacity="0.5" />
            <circle cx="220" cy="220" r="18" fill={`url(#hubBrass${uid})`} opacity="0.95" />
            <circle cx="220" cy="220" r="10" fill="#1a120c" />
            <text x="220" y="208" textAnchor="middle" fill="#c9a227" fontSize="18" letterSpacing="5" fontFamily="Palatino, Georgia, serif">
              PIT
            </text>
            <text x="220" y="228" textAnchor="middle" fill="#e8d5a3" fontSize="11" letterSpacing="1.6">
              AMERICAN
            </text>
          </svg>
        </div>

        <svg viewBox="0 0 440 440" className="rl-ball-layer" aria-hidden style={{ visibility: plan ? "visible" : "hidden" }}>
          <defs>
            <radialGradient id={`ivory${uid}`} cx="34%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="45%" stopColor="#ece4d6" />
              <stop offset="100%" stopColor="#8f877c" />
            </radialGradient>
          </defs>
          <circle ref={shadowRef} cx="220" cy="25" r="7" fill="#000" opacity="0.45" />
          <circle ref={ballRef} cx="220" cy="23" r="7" fill={`url(#ivory${uid})`} />
        </svg>

        <div className="rl-wheel-pointer" title="Pointer">
          <svg viewBox="0 0 28 36" width="24" height="30">
            <polygon points="14,34 2,4 26,4" fill="#e8d5a3" stroke="#8a6a12" strokeWidth="1.4" />
            <polygon points="14,28 8,8 20,8" fill="#c9a227" />
          </svg>
        </div>
      </div>

      <div className="rl-wheel-readout" aria-live="polite">
        {settled && pocket ? (
          <>
            <span className={`rl-pocket-pip ${pocketColor(pocket)}`}>{pocket}</span>
            <span className="muted">Ball</span>
          </>
        ) : spinning ? (
          <span className="muted">No more bets</span>
        ) : (
          <span className="muted">American · 0 / 00</span>
        )}
      </div>
    </div>
  );
}

export default function RouletteCloth({
  onAdd,
  onAmount,
  hit,
  lastNine,
  ghosts,
  locked,
  hideLastNine,
  removeMode,
  onRemove,
  paidOf = () => null,
}: {
  removeMode?: boolean;
  /** After a settled spin: which bet labels paid (true) or lost (false). Display only. */
  paidOf?: (label: string) => boolean | null;
  /** Take the last chip off a spot (remove mode tap, or long-press). */
  onRemove?: (label: string) => void;
  onAdd: (b: ClothBet) => void;
  onAmount: (label: string) => number;
  hit?: string | null;
  lastNine?: string[];
  ghosts?: GhostChip[];
  locked?: boolean;
  hideLastNine?: boolean;
}) {
  const ghostOn = (label: string) => ghosts?.find((g) => g.label === label)?.cents ?? 0;
  const [cover, setCover] = useState<Set<string>>(new Set());
  const flashT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tap = (b: ClothBet) => {
    if (locked) return;
    if (removeMode) { onRemove?.(b.label); return; }
    onAdd(b);
    // Tap feedback on touch screens: briefly light the covered numbers.
    setCover(new Set(coveredBy(b)));
    if (flashT.current) clearTimeout(flashT.current);
    flashT.current = setTimeout(() => setCover(new Set()), 700);
  };
  const hov = (b: ClothBet) => ({
    onMouseEnter: () => setCover(new Set(coveredBy(b))),
    onMouseLeave: () => setCover(new Set()),
    onFocus: () => setCover(new Set(coveredBy(b))),
    onBlur: () => setCover(new Set()),
  });
  const cv = (p: string) => (cover.has(p) ? " covered" : "");
  const press = useRef<{ t: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const suppress = useRef(false);
  const lastLP = useRef(0);
  const endPress = () => { if (press.current) clearTimeout(press.current.t); press.current = null; };
  const onPointerDown = (e: React.PointerEvent) => {
    suppress.current = false; // a fresh press never inherits a stale long-press swallow
    if (locked || e.pointerType === "mouse") return;
    const el = (e.target as HTMLElement).closest("[data-bet]") as HTMLElement | null;
    const label = el?.dataset.bet;
    if (!label || onAmount(label) <= 0) return;
    endPress();
    press.current = {
      x: e.clientX, y: e.clientY,
      t: setTimeout(() => { suppress.current = true; lastLP.current = Date.now(); press.current = null; onRemove?.(label); try { navigator.vibrate?.([8, 40, 8]); } catch { /* ignore */ } }, 480),
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p0 = press.current; if (p0 && Math.hypot(e.clientX - p0.x, e.clientY - p0.y) > 10) endPress();
  };

  return (
    <div className={`rl-cloth${locked ? " locked" : ""}${removeMode ? " remove-mode" : ""}`} role="group" aria-label="American roulette layout">
      {!hideLastNine && <LastNine pockets={lastNine || []} />}
      <div
        className="rl-grid"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPress}
        onPointerCancel={endPress}
        onClickCapture={(e) => { const swallow = shouldSwallowClick(suppress.current, lastLP.current, Date.now()); suppress.current = false; if (swallow) { e.stopPropagation(); e.preventDefault(); } }}
      >
        <button
          type="button"
          className={`rl-cell green zero00 ${hit === "00" ? "hit" : ""}${cv("00")}`}
          {...hov({ kind: "straight", numbers: ["00"], label: "00" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("00"); }}
          data-bet={"00"}
onClick={() => tap({ kind: "straight", numbers: ["00"], label: "00" })}
        >
          00
          <OnChip cents={onAmount("00")} paid={paidOf("00")} />
        </button>
        <button
          type="button"
          className={`rl-cell green zero0 ${hit === "0" ? "hit" : ""}${cv("0")}`}
          {...hov({ kind: "straight", numbers: ["0"], label: "0" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("0"); }}
          data-bet={"0"}
onClick={() => tap({ kind: "straight", numbers: ["0"], label: "0" })}
        >
          0
          <OnChip cents={onAmount("0")} paid={paidOf("0")} />
        </button>

        {FELT_ROWS.map((row, ri) =>
          row.map((n, ci) => {
            const col = RED.has(n) ? "red" : "black";
            const label = String(n);
            return (
              <button
                type="button"
                key={n}
                className={`rl-cell ${col} n n-${n} r${ri} c${ci} ${hit === label ? "hit" : ""}${cv(label)}`}
                aria-label={`${n} ${col}, straight up pays 35 to 1${onAmount(label) ? `, your bet ${money(onAmount(label))}` : ""}`}
                {...hov({ kind: "straight", numbers: [label], label })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.(label); }}
          data-bet={label}
          onClick={() => tap({ kind: "straight", numbers: [label], label })}
              >
                {n}
                <OnChip cents={onAmount(label)} paid={paidOf(label)} />
              </button>
            );
          }),
        )}

        {FELT_ROWS.map((row, ri) =>
          row.map((n, ci) => {
            const right = row[ci + 1];
            const below = FELT_ROWS[ri + 1]?.[ci];
            const belowRight = FELT_ROWS[ri + 1]?.[ci + 1];
            const splitH = right != null;
            const splitV = below != null;
            const corner = below != null && belowRight != null && right != null;
            const street = ri === 2;
            const six = ri === 2 && right != null;
            const streetNums = [FELT_ROWS[2]![ci]!, FELT_ROWS[1]![ci]!, FELT_ROWS[0]![ci]!];
            const nextStreet = six
              ? [FELT_ROWS[2]![ci + 1]!, FELT_ROWS[1]![ci + 1]!, FELT_ROWS[0]![ci + 1]!]
              : [];
            return (
              <div key={`hit-${n}`} className={`rl-hitpad r${ri} c${ci}`}>
                {splitH && (
                  <button
                    type="button"
                    className="rl-spot split-h"
                    {...hov({ kind: "split", numbers: [String(n), String(right)], label: "" })}
                    title={`Split ${Math.min(n, right)}-${Math.max(n, right)} · 17:1`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const nums = [n, right].sort((a, b) => a - b);
                      tap({ kind: "split", numbers: nums.map(String), label: `split ${nums.join("-")}` });
                    }}
                  >
                    <OnChip cents={onAmount(`split ${[n, right].sort((a, b) => a - b).join("-")}`)} paid={paidOf(`split ${[n, right].sort((a, b) => a - b).join("-")}`)} />
                  </button>
                )}
                {splitV && (
                  <button
                    type="button"
                    className="rl-spot split-v"
                    {...hov({ kind: "split", numbers: [String(n), String(below)], label: "" })}
                    title={`Split ${Math.min(n, below)}-${Math.max(n, below)} · 17:1`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const nums = [n, below].sort((a, b) => a - b);
                      tap({ kind: "split", numbers: nums.map(String), label: `split ${nums.join("-")}` });
                    }}
                  >
                    <OnChip cents={onAmount(`split ${[n, below].sort((a, b) => a - b).join("-")}`)} paid={paidOf(`split ${[n, below].sort((a, b) => a - b).join("-")}`)} />
                  </button>
                )}
                {corner && (
                  <button
                    type="button"
                    className="rl-spot corner"
                    {...hov({ kind: "corner", numbers: [n, right, below, belowRight].map(String), label: "" })}
                    title={`Corner ${[n, right, below, belowRight].sort((a, b) => a - b).join("-")} · 8:1`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const nums = [n, right, below, belowRight].sort((a, b) => a - b);
                      tap({ kind: "corner", numbers: nums.map(String), label: `corner ${nums.join("-")}` });
                    }}
                  >
                    <OnChip cents={onAmount(`corner ${[n, right, below, belowRight].sort((a, b) => a - b).join("-")}`)} paid={paidOf(`corner ${[n, right, below, belowRight].sort((a, b) => a - b).join("-")}`)} />
                  </button>
                )}
                {street && (
                  <button
                    type="button"
                    className="rl-spot street"
                    {...hov({ kind: "street", numbers: streetNums.map(String), label: "" })}
                    title={`Street ${streetNums[0]}-${streetNums[1]}-${streetNums[2]} · 11:1`}
                    onClick={(e) => {
                      e.stopPropagation();
                      tap({ kind: "street", numbers: streetNums.map(String), label: `street ${streetNums.join("-")}` });
                    }}
                  >
                    <OnChip cents={onAmount(`street ${streetNums.join("-")}`)} paid={paidOf(`street ${streetNums.join("-")}`)} />
                  </button>
                )}
                {six && (
                  <button
                    type="button"
                    className="rl-spot sixline"
                    {...hov({ kind: "six", numbers: [...streetNums, ...nextStreet].map(String), label: "" })}
                    title={`Six-line ${streetNums[0]}-${nextStreet[2]} · 5:1`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const nums = [...streetNums, ...nextStreet];
                      tap({ kind: "six", numbers: nums.map(String), label: `six ${nums[0]}-${nums[nums.length - 1]}` });
                    }}
                  >
                    <OnChip cents={onAmount(`six ${streetNums[0]}-${nextStreet[nextStreet.length - 1]}`)} paid={paidOf(`six ${streetNums[0]}-${nextStreet[nextStreet.length - 1]}`)} />
                  </button>
                )}
              </div>
            );
          }),
        )}

        {([3, 2, 1] as const).map((which, i) => (
          <button
            type="button"
            key={`col${which}`}
            className={`rl-cell outside col21 col-r${i}`}
            {...hov({ kind: "column", which, label: "" })}
            onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.(`col ${which}`); }}
          data-bet={`col ${which}`}
onClick={() => tap({ kind: "column", which, label: `col ${which}` })}
          >
            2:1
            <OnChip cents={onAmount(`col ${which}`)} paid={paidOf(`col ${which}`)} />
            <OnChip cents={ghostOn(`col ${which}`)} ghost />
          </button>
        ))}

        <button type="button" className="rl-cell outside dozen d1" {...hov({ kind: "dozen", which: 1, label: "1st 12" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("1st 12"); }}
          data-bet={"1st 12"}
onClick={() => tap({ kind: "dozen", which: 1, label: "1st 12" })}>
          1st 12
          <OnChip cents={onAmount("1st 12")} paid={paidOf("1st 12")} />
          <OnChip cents={ghostOn("1st 12")} ghost />
        </button>
        <button type="button" className="rl-cell outside dozen d2" {...hov({ kind: "dozen", which: 2, label: "2nd 12" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("2nd 12"); }}
          data-bet={"2nd 12"}
onClick={() => tap({ kind: "dozen", which: 2, label: "2nd 12" })}>
          2nd 12
          <OnChip cents={onAmount("2nd 12")} paid={paidOf("2nd 12")} />
          <OnChip cents={ghostOn("2nd 12")} ghost />
        </button>
        <button type="button" className="rl-cell outside dozen d3" {...hov({ kind: "dozen", which: 3, label: "3rd 12" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("3rd 12"); }}
          data-bet={"3rd 12"}
onClick={() => tap({ kind: "dozen", which: 3, label: "3rd 12" })}>
          3rd 12
          <OnChip cents={onAmount("3rd 12")} paid={paidOf("3rd 12")} />
          <OnChip cents={ghostOn("3rd 12")} ghost />
        </button>

        <button type="button" className="rl-cell outside even-money e-low" {...hov({ kind: "low", numbers: [], label: "1-18" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("1-18"); }}
          data-bet={"1-18"}
onClick={() => tap({ kind: "low", numbers: [], label: "1-18" })}>
          1 to 18
          <OnChip cents={onAmount("1-18")} paid={paidOf("1-18")} />
          <OnChip cents={ghostOn("1-18")} ghost />
        </button>
        <button type="button" className="rl-cell outside even-money e-even" {...hov({ kind: "even", numbers: [], label: "even" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("even"); }}
          data-bet={"even"}
onClick={() => tap({ kind: "even", numbers: [], label: "even" })}>
          Even
          <OnChip cents={onAmount("even")} paid={paidOf("even")} />
          <OnChip cents={ghostOn("even")} ghost />
        </button>
        <button type="button" className="rl-cell outside even-money e-red" {...hov({ kind: "red", numbers: [], label: "red" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("red"); }}
          data-bet={"red"}
onClick={() => tap({ kind: "red", numbers: [], label: "red" })}>
          <Diamond color="red" /> Red
          <OnChip cents={onAmount("red")} paid={paidOf("red")} />
          <OnChip cents={ghostOn("red")} ghost />
        </button>
        <button type="button" className="rl-cell outside even-money e-black" {...hov({ kind: "black", numbers: [], label: "black" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("black"); }}
          data-bet={"black"}
onClick={() => tap({ kind: "black", numbers: [], label: "black" })}>
          <Diamond color="black" /> Black
          <OnChip cents={onAmount("black")} paid={paidOf("black")} />
          <OnChip cents={ghostOn("black")} ghost />
        </button>
        <button type="button" className="rl-cell outside even-money e-odd" {...hov({ kind: "odd", numbers: [], label: "odd" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("odd"); }}
          data-bet={"odd"}
onClick={() => tap({ kind: "odd", numbers: [], label: "odd" })}>
          Odd
          <OnChip cents={onAmount("odd")} paid={paidOf("odd")} />
          <OnChip cents={ghostOn("odd")} ghost />
        </button>
        <button type="button" className="rl-cell outside even-money e-high" {...hov({ kind: "high", numbers: [], label: "19-36" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("19-36"); }}
          data-bet={"19-36"}
onClick={() => tap({ kind: "high", numbers: [], label: "19-36" })}>
          19 to 36
          <OnChip cents={onAmount("19-36")} paid={paidOf("19-36")} />
          <OnChip cents={ghostOn("19-36")} ghost />
        </button>
      </div>
    </div>
  );
}

export { money, LastNine };
