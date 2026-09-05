"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChipStack } from "./TableUX";
import { money } from "./useUser";
import { RED, WHEEL_ORDER as WHEEL, FELT_ROWS, pocketColor } from "@/lib/games/rouletteFelt";
export { RED, FELT_ROWS, pocketColor, WHEEL };

export const SPIN_MS = 1600;

export type ClothBet = {
  kind: string;
  numbers?: string[];
  which?: number;
  label: string;
};

export type GhostChip = { label: string; cents: number };

function OnChip({ cents, ghost }: { cents: number; ghost?: boolean }) {
  if (cents <= 0) return null;
  return (
    <span className={`chip-on-num${ghost ? " rl-bot-chip" : ""}`}>
      <ChipStack cents={cents} size={ghost ? 22 : 26} maxChips={ghost ? 2 : 4} showTotal={false} />
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

function pocketAngle(pocket: string) {
  const slice = 360 / WHEEL.length;
  const idx = WHEEL.indexOf(pocket as (typeof WHEEL)[number]);
  if (idx < 0) return 0;
  return -(idx * slice) - slice / 2;
}

function nextRotation(current: number, pocket: string) {
  const land = pocketAngle(pocket);
  const landNorm = ((land % 360) + 360) % 360;
  const turns = 2 + (pocket.length % 2);
  let target = current - 360 * turns;
  const targetNorm = ((target % 360) + 360) % 360;
  let adj = landNorm - targetNorm;
  target += adj;
  if (target > current - 360 * 2) target -= 360;
  return target;
}

function LastNine({ pockets }: { pockets: string[] }) {
  return (
    <div className="rl-last9" aria-label="Last nine numbers">
      {Array.from({ length: 9 }, (_, i) => {
        const p = pockets[i];
        if (!p) return <span key={`e${i}`} className="rl-last9-pip empty" />;
        return (
          <span key={`${p}-${i}`} className={`rl-last9-pip ${pocketColor(p)} ${i === 0 ? "newest" : ""}`}>
            {p}
          </span>
        );
      })}
    </div>
  );
}

export function tallySession(pockets: string[]) {
  const dozens = [0, 0, 0];
  let red = 0, black = 0, even = 0, odd = 0, low = 0, high = 0;
  const freq = new Map<string, { n: number; recency: number }>();
  pockets.forEach((p, i) => {
    const prev = freq.get(p);
    freq.set(p, { n: (prev?.n || 0) + 1, recency: prev ? prev.recency : i });
    if (p === "0" || p === "00") return;
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
    .slice(0, 3)
    .map(([p, v]) => ({ pocket: p, hits: v.n }));
  return { dozens, red, black, even, odd, low, high, hot };
}

export function RouletteStats({ pockets }: { pockets: string[] }) {
  const s = useMemo(() => tallySession(pockets), [pockets]);
  return (
    <aside className="rl-stats" aria-label="Session statistics from last numbers">
      <div className="rl-stats-h">Session · last {pockets.length}</div>
      <div className="rl-stats-grid">
        <div>
          <div className="rl-stats-row"><span>1st 12</span><strong>{s.dozens[0]}</strong></div>
          <div className="rl-stats-row"><span>2nd 12</span><strong>{s.dozens[1]}</strong></div>
          <div className="rl-stats-row"><span>3rd 12</span><strong>{s.dozens[2]}</strong></div>
        </div>
        <div>
          <div className="rl-stats-row"><span>Red</span><strong>{s.red}</strong></div>
          <div className="rl-stats-row"><span>Black</span><strong>{s.black}</strong></div>
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
            <span key={h.pocket} className={`rl-last9-pip ${pocketColor(h.pocket)}`} title={`${h.hits} hit${h.hits === 1 ? "" : "s"}`}>
              {h.pocket}
            </span>
          ))
        )}
      </div>
    </aside>
  );
}

export function RouletteWheel({
  pocket,
  spinning,
  spinId = 0,
}: {
  pocket?: string | null;
  spinning?: boolean;
  spinId?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const n = WHEEL.length;
  const slice = 360 / n;
  const rotRef = useRef(0);
  const applied = useRef(0);
  const [rot, setRot] = useState(0);
  const [orbitKey, setOrbitKey] = useState(0);
  const cx = 200;
  const cy = 200;
  const r0 = 62;
  const r1 = 168;

  useEffect(() => {
    if (!spinning || !pocket || !spinId) return;
    if (applied.current === spinId) return;
    applied.current = spinId;
    const next = nextRotation(rotRef.current, pocket);
    rotRef.current = next;
    setRot(next);
    setOrbitKey((k) => k + 1);
  }, [spinning, pocket, spinId]);

  const settled = !spinning && !!pocket;
  const showMarble = settled || !!spinning;

  return (
    <div className={`rl-wheel-scene ${spinning ? "spinning" : ""} ${settled ? "settled" : ""}`}>
      <div className="rl-bowl">
        <svg viewBox="0 0 400 400" className="rl-bowl-svg" aria-hidden>
          <defs>
            <radialGradient id={`wood${uid}`} cx="38%" cy="30%" r="72%">
              <stop offset="0%" stopColor="#8a5a3a" />
              <stop offset="38%" stopColor="#5a3422" />
              <stop offset="68%" stopColor="#2a160e" />
              <stop offset="100%" stopColor="#4a2a1a" />
            </radialGradient>
            <linearGradient id={`brass${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f0e0b0" />
              <stop offset="45%" stopColor="#c9a227" />
              <stop offset="100%" stopColor="#7a5a10" />
            </linearGradient>
            <radialGradient id={`groove${uid}`} cx="50%" cy="50%" r="50%">
              <stop offset="78%" stopColor="#1a100c" />
              <stop offset="86%" stopColor="#3a2418" />
              <stop offset="92%" stopColor="#1a100c" />
              <stop offset="100%" stopColor="#2a1810" />
            </radialGradient>
          </defs>
          <circle cx="200" cy="200" r="198" fill={`url(#wood${uid})`} />
          <circle cx="200" cy="200" r="186" fill="none" stroke={`url(#brass${uid})`} strokeWidth="10" />
          <circle cx="200" cy="200" r="178" fill={`url(#groove${uid})`} />
          <circle cx="200" cy="200" r="170" fill="none" stroke="#c9a227" strokeWidth="2.4" opacity="0.85" />
          <circle cx="200" cy="200" r="54" fill="#120c08" />
        </svg>

        <div
          className="rl-cylinder"
          style={{
            transform: `rotate(${rot}deg)`,
            transition: `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.62, 0.18, 1)`,
          }}
        >
          <svg viewBox="0 0 400 400" className="rl-wheel" aria-hidden>
            {WHEEL.map((p, i) => {
              const a0 = i * slice - 90;
              const a1 = (i + 1) * slice - 90;
              const col = pocketColor(p);
              const fill = col === "green" ? "#0f7a3e" : col === "red" ? "#b31b24" : "#161616";
              const mid = ((i * slice + slice / 2 - 90) * Math.PI) / 180;
              const tx = cx + 118 * Math.cos(mid);
              const ty = cy + 118 * Math.sin(mid);
              const fret0 = ((a0) * Math.PI) / 180;
              const fx0 = cx + r0 * Math.cos(fret0);
              const fy0 = cy + r0 * Math.sin(fret0);
              const fx1 = cx + r1 * Math.cos(fret0);
              const fy1 = cy + r1 * Math.sin(fret0);
              return (
                <g key={p + i}>
                  <path d={sectorPath(cx, cy, r0, r1, a0, a1)} fill={fill} />
                  <line
                    x1={fx0.toFixed(2)}
                    y1={fy0.toFixed(2)}
                    x2={fx1.toFixed(2)}
                    y2={fy1.toFixed(2)}
                    stroke="#e8d5a3"
                    strokeWidth="1.1"
                    opacity="0.85"
                  />
                  <text
                    x={tx.toFixed(2)}
                    y={ty.toFixed(2)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#f3ead7"
                    fontSize={p.length > 1 ? 11 : 13}
                    fontWeight="700"
                    transform={`rotate(${i * slice + slice / 2}, ${tx.toFixed(2)}, ${ty.toFixed(2)})`}
                  >
                    {p}
                  </text>
                </g>
              );
            })}
            <circle cx="200" cy="200" r="62" fill="none" stroke="#c9a227" strokeWidth="3" />
          </svg>
        </div>

        <div className="rl-hub" aria-hidden>
          <svg viewBox="0 0 400 400">
            <defs>
              <radialGradient id={`cap${uid}`} cx="40%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#3a2a1c" />
                <stop offset="100%" stopColor="#120c08" />
              </radialGradient>
            </defs>
            <circle cx="200" cy="200" r="56" fill={`url(#cap${uid})`} stroke="#c9a227" strokeWidth="3.5" />
            <circle cx="200" cy="200" r="46" fill="none" stroke="#e8d5a3" strokeWidth="1" opacity="0.45" />
            <text x="200" y="194" textAnchor="middle" fill="#c9a227" fontSize="16" letterSpacing="4" fontFamily="Palatino, Georgia, serif">
              PIT
            </text>
            <text x="200" y="214" textAnchor="middle" fill="#e8d5a3" fontSize="10" letterSpacing="1.4">
              00 / 0
            </text>
          </svg>
        </div>

        {showMarble && (
          <div key={orbitKey} className={`rl-ball-orbit ${spinning ? "run" : "rest"}`} aria-hidden>
            <span className="rl-ball" />
          </div>
        )}

        <div className="rl-wheel-pointer" title="Pointer">
          <svg viewBox="0 0 28 36" width="22" height="28">
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
          <span className="muted">American wheel</span>
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
}: {
  onAdd: (b: ClothBet) => void;
  onAmount: (label: string) => number;
  hit?: string | null;
  lastNine?: string[];
  ghosts?: GhostChip[];
  locked?: boolean;
}) {
  const ghostOn = (label: string) => ghosts?.find((g) => g.label === label)?.cents ?? 0;
  const tap = (b: ClothBet) => {
    if (locked) return;
    onAdd(b);
  };

  return (
    <div className={`rl-cloth${locked ? " locked" : ""}`} role="group" aria-label="American roulette layout">
      <LastNine pockets={lastNine || []} />
      <div className="rl-grid">
        <button
          type="button"
          className={`rl-cell green zero00 ${hit === "00" ? "hit" : ""}`}
          onClick={() => tap({ kind: "straight", numbers: ["00"], label: "00" })}
        >
          00
          <OnChip cents={onAmount("00")} />
        </button>
        <button
          type="button"
          className={`rl-cell green zero0 ${hit === "0" ? "hit" : ""}`}
          onClick={() => tap({ kind: "straight", numbers: ["0"], label: "0" })}
        >
          0
          <OnChip cents={onAmount("0")} />
        </button>
        <button
          type="button"
          className="rl-cell green basket"
          onClick={() => tap({ kind: "five", numbers: ["0", "00", "1", "2", "3"], label: "five-number" })}
          title="Five-number 0-00-1-2-3 · 6:1"
        >
          0-00
          <OnChip cents={onAmount("five-number")} />
        </button>

        {FELT_ROWS.map((row, ri) =>
          row.map((n, ci) => {
            const col = RED.has(n) ? "red" : "black";
            const label = String(n);
            return (
              <button
                type="button"
                key={n}
                className={`rl-cell ${col} n n-${n} r${ri} c${ci} ${hit === label ? "hit" : ""}`}
                onClick={() => tap({ kind: "straight", numbers: [label], label })}
              >
                {n}
                <OnChip cents={onAmount(label)} />
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
                    title={`Split ${n}-${right} · 17:1`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const nums = [n, right].sort((a, b) => a - b);
                      tap({ kind: "split", numbers: nums.map(String), label: `split ${nums.join("-")}` });
                    }}
                  >
                    <OnChip cents={onAmount(`split ${[n, right].sort((a, b) => a - b).join("-")}`)} />
                  </button>
                )}
                {splitV && (
                  <button
                    type="button"
                    className="rl-spot split-v"
                    title={`Split ${n}-${below} · 17:1`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const nums = [n, below].sort((a, b) => a - b);
                      tap({ kind: "split", numbers: nums.map(String), label: `split ${nums.join("-")}` });
                    }}
                  >
                    <OnChip cents={onAmount(`split ${[n, below].sort((a, b) => a - b).join("-")}`)} />
                  </button>
                )}
                {corner && (
                  <button
                    type="button"
                    className="rl-spot corner"
                    title={`Corner ${[n, right, below, belowRight].sort((a, b) => a - b).join("-")} · 8:1`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const nums = [n, right, below, belowRight].sort((a, b) => a - b);
                      tap({ kind: "corner", numbers: nums.map(String), label: `corner ${nums.join("-")}` });
                    }}
                  >
                    <OnChip cents={onAmount(`corner ${[n, right, below, belowRight].sort((a, b) => a - b).join("-")}`)} />
                  </button>
                )}
                {street && (
                  <button
                    type="button"
                    className="rl-spot street"
                    title={`Street ${streetNums[0]}-${streetNums[1]}-${streetNums[2]} · 11:1`}
                    onClick={(e) => {
                      e.stopPropagation();
                      tap({ kind: "street", numbers: streetNums.map(String), label: `street ${streetNums.join("-")}` });
                    }}
                  >
                    <OnChip cents={onAmount(`street ${streetNums.join("-")}`)} />
                  </button>
                )}
                {six && (
                  <button
                    type="button"
                    className="rl-spot sixline"
                    title={`Six-line ${streetNums[0]}-${nextStreet[2]} · 5:1`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const nums = [...streetNums, ...nextStreet];
                      tap({ kind: "six", numbers: nums.map(String), label: `six ${nums[0]}-${nums[nums.length - 1]}` });
                    }}
                  >
                    <OnChip cents={onAmount(`six ${streetNums[0]}-${nextStreet[nextStreet.length - 1]}`)} />
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
            onClick={() => tap({ kind: "column", which, label: `col ${which}` })}
          >
            2:1
            <OnChip cents={onAmount(`col ${which}`)} />
            <OnChip cents={ghostOn(`col ${which}`)} ghost />
          </button>
        ))}

        <button type="button" className="rl-cell outside dozen d1" onClick={() => tap({ kind: "dozen", which: 1, label: "1st 12" })}>
          1st 12
          <OnChip cents={onAmount("1st 12")} />
          <OnChip cents={ghostOn("1st 12")} ghost />
        </button>
        <button type="button" className="rl-cell outside dozen d2" onClick={() => tap({ kind: "dozen", which: 2, label: "2nd 12" })}>
          2nd 12
          <OnChip cents={onAmount("2nd 12")} />
          <OnChip cents={ghostOn("2nd 12")} ghost />
        </button>
        <button type="button" className="rl-cell outside dozen d3" onClick={() => tap({ kind: "dozen", which: 3, label: "3rd 12" })}>
          3rd 12
          <OnChip cents={onAmount("3rd 12")} />
          <OnChip cents={ghostOn("3rd 12")} ghost />
        </button>

        <button type="button" className="rl-cell outside even-money e-low" onClick={() => tap({ kind: "low", numbers: [], label: "1-18" })}>
          1 to 18
          <OnChip cents={onAmount("1-18")} />
          <OnChip cents={ghostOn("1-18")} ghost />
        </button>
        <button type="button" className="rl-cell outside even-money e-even" onClick={() => tap({ kind: "even", numbers: [], label: "even" })}>
          Even
          <OnChip cents={onAmount("even")} />
          <OnChip cents={ghostOn("even")} ghost />
        </button>
        <button type="button" className="rl-cell outside even-money e-red" onClick={() => tap({ kind: "red", numbers: [], label: "red" })}>
          <Diamond color="red" /> Red
          <OnChip cents={onAmount("red")} />
          <OnChip cents={ghostOn("red")} ghost />
        </button>
        <button type="button" className="rl-cell outside even-money e-black" onClick={() => tap({ kind: "black", numbers: [], label: "black" })}>
          <Diamond color="black" /> Black
          <OnChip cents={onAmount("black")} />
          <OnChip cents={ghostOn("black")} ghost />
        </button>
        <button type="button" className="rl-cell outside even-money e-odd" onClick={() => tap({ kind: "odd", numbers: [], label: "odd" })}>
          Odd
          <OnChip cents={onAmount("odd")} />
          <OnChip cents={ghostOn("odd")} ghost />
        </button>
        <button type="button" className="rl-cell outside even-money e-high" onClick={() => tap({ kind: "high", numbers: [], label: "19-36" })}>
          19 to 36
          <OnChip cents={onAmount("19-36")} />
          <OnChip cents={ghostOn("19-36")} ghost />
        </button>
      </div>
    </div>
  );
}

export { money };
