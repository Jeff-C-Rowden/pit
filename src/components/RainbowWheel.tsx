"use client";
/**
 * Rainbow Wheel bonus for Kettle of Clover. The server has already drawn the wedge (and the outer-wheel wedge
 * after an UPGRADE) and paid the result; this only animates the wheel so it stops exactly on that wedge.
 * Every wedge is the same size and equally likely. Under reduced motion the wheel jumps straight to its stop.
 */
import { useEffect, useRef, useState } from "react";
import { SandboxChip } from "@/components/SandboxChip";
import { CL_INNER_WHEEL, CL_OUTER_WHEEL, type Wedge } from "@/lib/games/clover";
import { money } from "@/components/useUser";
import { landingRotation, wedgeAtPointer } from "@/lib/wheel";
export { landingRotation, wedgeAtPointer };

export type WheelResult = { inner: number; outer: number | null; result: Wedge; creditX: number; creditWinCents: number; totalWinCents: number; freeSpins: unknown };

const N = 12, SLICE = 360 / N;
const INNER_COLORS = ["#e8413a", "#f39a2a", "#f7d83a", "#4cb84a", "#3a7ad8", "#7a4ab8"];
const OUTER_COLORS = ["#b8862a", "#fedd52"];

const label = (w: Wedge) => (w.kind === "credit" ? `${w.x}×` : w.kind === "fs" ? `${w.spins} FS` : "UP");
const polar = (r: number, deg: number) => [r * Math.sin((deg * Math.PI) / 180), -r * Math.cos((deg * Math.PI) / 180)] as const;

function Ring({ wedges, r0, r1, colors, fontSize, size }: { wedges: Wedge[]; r0: number; r1: number; colors: string[]; fontSize: number; size: number }) {
  const h = size / 2;
  return (
    <svg viewBox={`${-h} ${-h} ${size} ${size}`} width="100%" height="100%" aria-hidden>
      {wedges.map((w, i) => {
        const a0 = i * SLICE, a1 = (i + 1) * SLICE, mid = a0 + SLICE / 2;
        const [x0, y0] = polar(r1, a0), [x1, y1] = polar(r1, a1), [x2, y2] = polar(r0, a1), [x3, y3] = polar(r0, a0);
        const d = r0 > 0
          ? `M${x0} ${y0} A${r1} ${r1} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 0 0 ${x3} ${y3} Z`
          : `M0 0 L${x0} ${y0} A${r1} ${r1} 0 0 1 ${x1} ${y1} Z`;
        const [tx, ty] = polar((r0 + r1) / 2 + (r0 > 0 ? 0 : 8), mid);
        const special = w.kind !== "credit";
        return (
          <g key={i}>
            <path d={d} fill={special ? (w.kind === "fs" ? "#0f4a24" : "#2a0e3a") : colors[i % colors.length]} stroke="#1a0e04" strokeWidth="2" />
            <text x={tx} y={ty} transform={`rotate(${mid} ${tx} ${ty})`} textAnchor="middle" dominantBaseline="middle" fontSize={special ? fontSize * 0.8 : fontSize} fontWeight="900"
              fill={special ? "#fedd52" : "#1a0e04"} fontFamily="var(--st-display, Impact), sans-serif">{label(w)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function RainbowWheel({ wheel, betCents, reduced, onDone }: { wheel: WheelResult; betCents: number; reduced: boolean; onDone: () => void }) {
  const [stage, setStage] = useState<"ready" | "inner" | "innerDone" | "outer" | "done">("ready");
  const [innerRot, setInnerRot] = useState(0);
  const [outerRot, setOuterRot] = useState(0);
  const ms = reduced ? 0 : 4200;
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const upgraded = wheel.outer !== null;

  const spinInner = () => {
    setStage("inner");
    setInnerRot(landingRotation(wheel.inner));
    timer.current = window.setTimeout(() => setStage(upgraded ? "innerDone" : "done"), ms + 80);
  };
  const spinOuter = () => {
    setStage("outer");
    setOuterRot(landingRotation(wheel.outer!, 5));
    timer.current = window.setTimeout(() => setStage("done"), ms + 80);
  };

  const r = wheel.result;
  const resultText = r.kind === "credit" ? `${r.x}× bet · ${money(wheel.creditWinCents)}` : r.kind === "fs" ? `${r.spins} expanding-wild free spins` : "";

  return (
    <div className="mine-modal cl-modal" role="dialog" aria-modal="true" aria-labelledby="cl-wheel-h">
      <div className="mine-modal-card cl-wheel-card">
        <div className="bookend-head"><p className="mine-kicker">Bonus</p><SandboxChip /></div>
        <h2 id="cl-wheel-h">{stage === "innerDone" || stage === "outer" || (stage === "done" && upgraded) ? "Pot-of-Gold Wheel" : "Rainbow Wheel"}</h2>
        <div className={`cl-wheel${upgraded && stage !== "ready" && stage !== "inner" ? " outer-live" : ""}`}>
          <span className="cl-wheel-pointer" aria-hidden />
          <div className="cl-wheel-outer" data-rotation={outerRot} data-landed={stage === "done" && upgraded ? wedgeAtPointer(outerRot) : ""}
            style={{ transform: `rotate(${outerRot}deg)`, transition: stage === "outer" && ms ? `transform ${ms}ms cubic-bezier(.15,.7,.12,1)` : "none" }}>
            <Ring wedges={CL_OUTER_WHEEL} r0={122} r1={168} colors={OUTER_COLORS} fontSize={15} size={340} />
          </div>
          <div className="cl-wheel-inner" data-rotation={innerRot} data-landed={stage !== "ready" && stage !== "inner" ? wedgeAtPointer(innerRot) : ""}
            style={{ transform: `rotate(${innerRot}deg)`, transition: stage === "inner" && ms ? `transform ${ms}ms cubic-bezier(.15,.7,.12,1)` : "none" }}>
            <Ring wedges={CL_INNER_WHEEL} r0={0} r1={118} colors={INNER_COLORS} fontSize={16} size={340} />
          </div>
          <span className="cl-wheel-hub" aria-hidden>☘</span>
        </div>
        <div className="cl-wheel-status" aria-live="polite">
          {stage === "ready" && <p>Every wedge is the same size. Inner wedges pay 5× to 20× bet, award 10 free spins, or UPGRADE to the outer Pot-of-Gold wheel (25× to 250× bet or 20 free spins).</p>}
          {(stage === "inner" || stage === "outer") && <p>Spinning…</p>}
          {stage === "innerDone" && <p className="cl-wheel-res">UPGRADE! On to the Pot-of-Gold wheel.</p>}
          {stage === "done" && <p className="cl-wheel-res">{resultText}</p>}
        </div>
        {stage === "ready" && <button type="button" className="btn primary" onClick={spinInner} autoFocus>Spin the Rainbow Wheel</button>}
        {stage === "innerDone" && <button type="button" className="btn primary" onClick={spinOuter} autoFocus>Spin the Pot-of-Gold Wheel</button>}
        {stage === "done" && <button type="button" className="btn primary" onClick={onDone} autoFocus>{r.kind === "fs" ? "Start free spins" : `Collect ${money(wheel.creditWinCents)}`}</button>}
        <p className="mine-honest">How it works: the server picked the wedge when the rainbows landed and has already paid it; the wheel is animated to stop on that wedge. Bet {money(betCents)}.</p>
      </div>
    </div>
  );
}
