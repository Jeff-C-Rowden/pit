"use client";
import { shouldSwallowClick } from "@/lib/tapGuard";
import { buzz } from "@/lib/feel";
import type React from "react";
import { useRef, useState } from "react";
import { ChipStack } from "./TableUX";
import { SeatAvatar } from "./Seating";
import { money } from "./useUser";
import { RED, WHEEL_ORDER as WHEEL, FELT_ROWS, pocketColor, coveredBy } from "@/lib/games/rouletteFelt";
export { RED, FELT_ROWS, pocketColor, WHEEL };

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
      {!ghost && <span className="rl-bet-amt"><span className="amt-full">{money(cents)}</span><span className="amt-short">{money(cents).replace(/\.00$/, "")}</span></span>}
    </span>
  );
}

/** Gold marker set on the winning number after a real settled spin. */
function Dolly() {
  return (
    <span className="rl-dolly" aria-hidden>
      <svg viewBox="0 0 22 34">
        <defs>
          <linearGradient id="rl-dolly-au" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff6c4" /><stop offset="45%" stopColor="#f0c040" /><stop offset="100%" stopColor="#8a5a0c" />
          </linearGradient>
        </defs>
        <ellipse cx="11" cy="30.5" rx="9.5" ry="3.2" fill="#8a5a0c" />
        <path d="M2 29 Q2 25 6 24.5 L16 24.5 Q20 25 20 29 Z" fill="url(#rl-dolly-au)" stroke="#5a3a06" strokeWidth=".6" />
        <path d="M7.5 24.5 C8 18 9.6 15 9.6 12 L12.4 12 C12.4 15 14 18 14.5 24.5 Z" fill="url(#rl-dolly-au)" stroke="#5a3a06" strokeWidth=".6" />
        <circle cx="11" cy="7.5" r="5.5" fill="url(#rl-dolly-au)" stroke="#5a3a06" strokeWidth=".6" />
        <circle cx="9.2" cy="5.8" r="1.8" fill="rgba(255,255,240,.8)" />
      </svg>
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

const BET_ARIA: Record<string, string> = {
  "0": "0 green, straight up pays 35 to 1", "00": "00 green, straight up pays 35 to 1",
  "1st 12": "First dozen, 1 to 12, pays 2 to 1", "2nd 12": "Second dozen, 13 to 24, pays 2 to 1", "3rd 12": "Third dozen, 25 to 36, pays 2 to 1",
  "1-18": "Low, 1 to 18, pays even money", "19-36": "High, 19 to 36, pays even money",
  even: "Even, pays even money", odd: "Odd, pays even money", red: "Red, pays even money", black: "Black, pays even money",
  "col 1": "Column 1, pays 2 to 1", "col 2": "Column 2, pays 2 to 1", "col 3": "Column 3, pays 2 to 1",
};
function betAria(key: string, on: number): string {
  const base = BET_ARIA[key] ?? key;
  return on > 0 ? `${base}, your bet ${money(on)}` : base;
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
      t: setTimeout(() => { suppress.current = true; lastLP.current = Date.now(); press.current = null; onRemove?.(label); buzz([8, 40, 8]); }, 480),
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
          data-bet={"00"} aria-label={betAria("00", onAmount("00"))} aria-pressed={onAmount("00") > 0}
onClick={() => tap({ kind: "straight", numbers: ["00"], label: "00" })}
        >
          00
          {hit === "00" && <Dolly />}
          <OnChip cents={onAmount("00")} paid={paidOf("00")} />
        </button>
        <button
          type="button"
          className={`rl-cell green zero0 ${hit === "0" ? "hit" : ""}${cv("0")}`}
          {...hov({ kind: "straight", numbers: ["0"], label: "0" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("0"); }}
          data-bet={"0"} aria-label={betAria("0", onAmount("0"))} aria-pressed={onAmount("0") > 0}
onClick={() => tap({ kind: "straight", numbers: ["0"], label: "0" })}
        >
          0
          {hit === "0" && <Dolly />}
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
          data-bet={label} aria-pressed={onAmount(label) > 0}
          onClick={() => tap({ kind: "straight", numbers: [label], label })}
              >
                {n}
                {hit === label && <Dolly />}
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
                    title={`Split ${Math.min(n, right)}-${Math.max(n, right)} · 17:1`} aria-label={`Split ${Math.min(n, right)}-${Math.max(n, right)} · 17:1`.replace("·", "pays")}
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
                    title={`Split ${Math.min(n, below)}-${Math.max(n, below)} · 17:1`} aria-label={`Split ${Math.min(n, below)}-${Math.max(n, below)} · 17:1`.replace("·", "pays")}
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
                    title={`Corner ${[n, right, below, belowRight].sort((a, b) => a - b).join("-")} · 8:1`} aria-label={`Corner ${[n, right, below, belowRight].sort((a, b) => a - b).join("-")} · 8:1`.replace("·", "pays")}
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
                    title={`Street ${streetNums[0]}-${streetNums[1]}-${streetNums[2]} · 11:1`} aria-label={`Street ${streetNums[0]}-${streetNums[1]}-${streetNums[2]} · 11:1`.replace("·", "pays")}
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
                    title={`Six-line ${streetNums[0]}-${nextStreet[2]} · 5:1`} aria-label={`Six-line ${streetNums[0]}-${nextStreet[2]} · 5:1`.replace("·", "pays")}
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
          data-bet={`col ${which}`} aria-label={betAria(`col ${which}`, onAmount(`col ${which}`))} aria-pressed={onAmount(`col ${which}`) > 0}
onClick={() => tap({ kind: "column", which, label: `col ${which}` })}
          >
            2:1
            <OnChip cents={onAmount(`col ${which}`)} paid={paidOf(`col ${which}`)} />
            <OnChip cents={ghostOn(`col ${which}`)} ghost />
          </button>
        ))}

        <button type="button" className="rl-cell outside dozen d1" {...hov({ kind: "dozen", which: 1, label: "1st 12" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("1st 12"); }}
          data-bet={"1st 12"} aria-label={betAria("1st 12", onAmount("1st 12"))} aria-pressed={onAmount("1st 12") > 0}
onClick={() => tap({ kind: "dozen", which: 1, label: "1st 12" })}>
          1st 12
          <OnChip cents={onAmount("1st 12")} paid={paidOf("1st 12")} />
          <OnChip cents={ghostOn("1st 12")} ghost />
        </button>
        <button type="button" className="rl-cell outside dozen d2" {...hov({ kind: "dozen", which: 2, label: "2nd 12" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("2nd 12"); }}
          data-bet={"2nd 12"} aria-label={betAria("2nd 12", onAmount("2nd 12"))} aria-pressed={onAmount("2nd 12") > 0}
onClick={() => tap({ kind: "dozen", which: 2, label: "2nd 12" })}>
          2nd 12
          <OnChip cents={onAmount("2nd 12")} paid={paidOf("2nd 12")} />
          <OnChip cents={ghostOn("2nd 12")} ghost />
        </button>
        <button type="button" className="rl-cell outside dozen d3" {...hov({ kind: "dozen", which: 3, label: "3rd 12" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("3rd 12"); }}
          data-bet={"3rd 12"} aria-label={betAria("3rd 12", onAmount("3rd 12"))} aria-pressed={onAmount("3rd 12") > 0}
onClick={() => tap({ kind: "dozen", which: 3, label: "3rd 12" })}>
          3rd 12
          <OnChip cents={onAmount("3rd 12")} paid={paidOf("3rd 12")} />
          <OnChip cents={ghostOn("3rd 12")} ghost />
        </button>

        <button type="button" className="rl-cell outside even-money e-low" {...hov({ kind: "low", numbers: [], label: "1-18" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("1-18"); }}
          data-bet={"1-18"} aria-label={betAria("1-18", onAmount("1-18"))} aria-pressed={onAmount("1-18") > 0}
onClick={() => tap({ kind: "low", numbers: [], label: "1-18" })}>
          1 to 18
          <OnChip cents={onAmount("1-18")} paid={paidOf("1-18")} />
          <OnChip cents={ghostOn("1-18")} ghost />
        </button>
        <button type="button" className="rl-cell outside even-money e-even" {...hov({ kind: "even", numbers: [], label: "even" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("even"); }}
          data-bet={"even"} aria-label={betAria("even", onAmount("even"))} aria-pressed={onAmount("even") > 0}
onClick={() => tap({ kind: "even", numbers: [], label: "even" })}>
          Even
          <OnChip cents={onAmount("even")} paid={paidOf("even")} />
          <OnChip cents={ghostOn("even")} ghost />
        </button>
        <button type="button" className="rl-cell outside even-money e-red" {...hov({ kind: "red", numbers: [], label: "red" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("red"); }}
          data-bet={"red"} aria-label={betAria("red", onAmount("red"))} aria-pressed={onAmount("red") > 0}
onClick={() => tap({ kind: "red", numbers: [], label: "red" })}>
          <Diamond color="red" /> Red
          <OnChip cents={onAmount("red")} paid={paidOf("red")} />
          <OnChip cents={ghostOn("red")} ghost />
        </button>
        <button type="button" className="rl-cell outside even-money e-black" {...hov({ kind: "black", numbers: [], label: "black" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("black"); }}
          data-bet={"black"} aria-label={betAria("black", onAmount("black"))} aria-pressed={onAmount("black") > 0}
onClick={() => tap({ kind: "black", numbers: [], label: "black" })}>
          <Diamond color="black" /> Black
          <OnChip cents={onAmount("black")} paid={paidOf("black")} />
          <OnChip cents={ghostOn("black")} ghost />
        </button>
        <button type="button" className="rl-cell outside even-money e-odd" {...hov({ kind: "odd", numbers: [], label: "odd" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("odd"); }}
          data-bet={"odd"} aria-label={betAria("odd", onAmount("odd"))} aria-pressed={onAmount("odd") > 0}
onClick={() => tap({ kind: "odd", numbers: [], label: "odd" })}>
          Odd
          <OnChip cents={onAmount("odd")} paid={paidOf("odd")} />
          <OnChip cents={ghostOn("odd")} ghost />
        </button>
        <button type="button" className="rl-cell outside even-money e-high" {...hov({ kind: "high", numbers: [], label: "19-36" })}
          onContextMenu={(e) => { e.preventDefault(); if (!locked && Date.now() - lastLP.current > 900) onRemove?.("19-36"); }}
          data-bet={"19-36"} aria-label={betAria("19-36", onAmount("19-36"))} aria-pressed={onAmount("19-36") > 0}
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
