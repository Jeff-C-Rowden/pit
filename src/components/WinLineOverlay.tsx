"use client";
/**
 * Draws the server's paid wins over the reel window once every reel has landed: a thick glowing
 * line through each winning payline (or a path joining each ways group), a frame on every winning
 * symbol, dimmed non-winning symbols, and a payout label. Several wins walk through (Slot Scout S3):
 * the total first with every win drawn together, then each win ~400ms, then it settles on the total
 * and stays still. Tap the reels to skip to the total. Reduced motion: the still total view only.
 * Purely presentational: it only ever shows wins that are in the spin result.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { reducedMotion } from "@/lib/feel";
import { showText, totalText, unionCells, walkDurationMs, walkStep, WIN_SHOW_DELAY_MS, type WalkStep, type WinCell, type WinShow } from "@/lib/winShow";

type Geo = { w: number; h: number; cols: { x: number; w: number; y: number; h: number }[]; rows: number };

const ROWS = 3;
const COLORS = ["#ffd23a", "#4ff0ff", "#ff6bd6", "#8dff5a", "#ff9a3c", "#b78bff", "#ffffff", "#ff5a5a", "#5ab0ff"];

function measure(host: HTMLElement): Geo | null {
  const win = host.parentElement;
  if (!win) return null;
  const base = win.getBoundingClientRect();
  const reels = Array.from(win.querySelectorAll<HTMLElement>(".reel")).filter((el) => !el.parentElement?.closest(".reel"));
  if (!reels.length || base.width <= 0) return null;
  const cols = reels.map((el) => {
    const r = el.getBoundingClientRect();
    const sx = el.offsetWidth ? r.width / el.offsetWidth : 1;
    const sy = el.offsetHeight ? r.height / el.offsetHeight : 1;
    return {
      x: r.left - base.left + el.clientLeft * sx,
      w: el.clientWidth * sx,
      y: r.top - base.top + el.clientTop * sy,
      h: el.clientHeight * sy,
    };
  });
  return { w: base.width, h: base.height, cols, rows: ROWS };
}

function centre(g: Geo, c: WinCell) {
  const col = g.cols[c.reel];
  if (!col) return null;
  const rh = col.h / g.rows;
  return { x: col.x + col.w / 2, y: col.y + rh * (c.row + 0.5), cw: col.w, rh, left: col.x, top: col.y + rh * c.row };
}

/** Row band for the payout pill: the one covering the fewest winning symbols under it (bottom, then top, then middle). */
function pickLabelRow(show: WinShow, reels: number, rows: number): number {
  const lo = reels >= 5 ? 1 : 0, hi = reels >= 5 ? reels - 2 : reels - 1;
  const under = (row: number) => show.cells.filter((c) => c.row === row && c.reel >= lo && c.reel <= hi).length;
  let best = rows - 1;
  for (const r of [rows - 1, 0, 1]) if (under(r) < under(best)) best = r;
  return best;
}

const lineColor = (s: WinShow, i: number) => s.kind === "scatter" ? "#ffd23a" : COLORS[(s.kind === "line" ? Number(s.key.replace(/\D/g, "")) || 0 : i) % COLORS.length]!;

function ShowPath({ g, show, color, id }: { g: Geo; show: WinShow; color: string; id: string }) {
  if (show.kind === "scatter") return null;
  const segs = show.segments.map(([a, b], i) => {
    const p = centre(g, a), q = centre(g, b);
    if (!p || !q) return null;
    return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
  });
  // a straight polyline for paylines reads better than separate segments (joins are rounded)
  const linePts = show.kind === "line" && show.segments.length
    ? [show.segments[0]![0], ...show.segments.map((s) => s[1])].map((c) => centre(g, c)).filter(Boolean).map((p) => `${p!.x},${p!.y}`).join(" ")
    : "";
  return (
    <g key={id} className="wl-path" style={{ ["--wl-c" as string]: color }}>
      {linePts ? (
        <>
          <polyline className="wl-under" points={linePts} />
          <polyline className="wl-stroke" points={linePts} pathLength={100} />
        </>
      ) : (
        <>
          <g className="wl-under">{segs}</g>
          <g className="wl-stroke">{segs}</g>
        </>
      )}
    </g>
  );
}

export default function WinLineOverlay({ shows, active }: { shows: WinShow[]; active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [step, setStep] = useState<WalkStep | null>(null);
  const [reduced, setReduced] = useState(false);
  const skipRef = useRef<() => void>(() => {});
  const sig = useMemo(() => shows.map((s) => `${s.key}:${s.winCents}:${s.cells.map((c) => `${c.reel}${c.row}`).join("")}`).join("|"), [shows]);
  const on = active && shows.length > 0;

  useEffect(() => { setReduced(reducedMotion()); }, []);

  // start after the reels settle; walk through once; stop the moment a new spin begins (active goes false)
  useEffect(() => {
    setStep(null);
    skipRef.current = () => {};
    if (!on) return;
    let iv = 0;
    let skipped = reducedMotion();
    let t0 = 0;
    const tick = () => {
      const s = walkStep(shows.length, performance.now() - t0, skipped);
      setStep((prev) => (prev && prev.phase === s.phase && prev.index === s.index ? prev : s));
      if (s.phase === "done" && iv) { window.clearInterval(iv); iv = 0; }
    };
    const to = window.setTimeout(() => {
      t0 = performance.now();
      tick();
      if (!skipped && walkDurationMs(shows.length) > 0) iv = window.setInterval(tick, 50);
    }, WIN_SHOW_DELAY_MS);
    skipRef.current = () => { if (skipped) return; skipped = true; if (t0) tick(); };
    return () => { window.clearTimeout(to); if (iv) window.clearInterval(iv); skipRef.current = () => {}; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, sig]);

  useLayoutEffect(() => {
    if (!on || !step) return;
    const host = hostRef.current;
    if (!host) return;
    const sync = () => setGeo(measure(host));
    sync();
    const win = host.parentElement;
    const ro = typeof ResizeObserver !== "undefined" && win ? new ResizeObserver(sync) : null;
    if (ro && win) ro.observe(win);
    window.addEventListener("resize", sync);
    return () => { ro?.disconnect(); window.removeEventListener("resize", sync); };
  }, [on, !!step]);

  const summary = on ? `${shows.length > 1 ? `${totalText(shows)}. ` : ""}${shows.map(showText).join("; ")}` : "";
  if (!on || !step || !geo) {
    return <div ref={hostRef} className="wl-host" aria-hidden={!summary}>{summary && <span className="sr-only">Wins: {summary}</span>}</div>;
  }
  // which wins are drawn: the one stepped to, or all of them on the total view
  const single = step.index >= 0 ? shows[step.index] ?? null : null;
  const drawn = single ? [single] : shows;
  const walking = step.phase !== "done";
  const isTotal = !single;
  const color = single ? lineColor(single, step.index) : "#ffd23a";
  const cells = unionCells(drawn);
  const hit = new Set(cells.map((c) => `${c.reel}-${c.row}`));
  const dims: JSX.Element[] = [];
  const frames: JSX.Element[] = [];
  geo.cols.forEach((col, reel) => {
    for (let row = 0; row < geo.rows; row++) {
      const p = centre(geo, { reel, row })!;
      const k = `${reel}-${row}`;
      if (hit.has(k)) frames.push(<rect key={k} className="wl-frame" x={p.left + 3} y={p.top + 3} width={Math.max(0, p.cw - 6)} height={Math.max(0, p.rh - 6)} rx={8} />);
      else dims.push(<rect key={k} className="wl-dim" x={p.left} y={p.top} width={p.cw} height={p.rh} />);
    }
  });
  // label away from the winning cells when possible
  const labelRow = pickLabelRow({ ...drawn[0]!, cells }, geo.cols.length, geo.rows);
  const viewKey = `${step.phase}-${step.index}`;
  const kind = isTotal && shows.length > 1 ? "total" : drawn[0]!.kind;
  return (
    <div
      ref={hostRef}
      className={`wl-host on${reduced ? " wl-reduced" : ""}${walking ? " wl-walking" : ""}`}
      data-win-show={kind}
      data-win-phase={step.phase}
      data-win-index={step.index}
      data-win-count={shows.length}
      style={{ ["--wl-c" as string]: color }}
      onPointerDown={walking ? (e) => { e.stopPropagation(); skipRef.current(); } : undefined}
      title={walking ? "Tap to skip to the total" : undefined}
    >
      <svg className="wl-svg" width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden>
        <g className="wl-dims">{dims}</g>
        <g key={`p-${viewKey}`}>{drawn.map((s, i) => <ShowPath key={s.key} id={s.key} g={geo} show={s} color={single ? color : lineColor(s, i)} />)}</g>
        <g key={`f-${viewKey}`} className="wl-frames">{frames}</g>
      </svg>
      <span key={`t-${viewKey}`} className={`wl-label${isTotal && shows.length > 1 ? " total" : ""}${labelRow === 0 ? " top" : labelRow === 1 ? " mid" : ""}`} data-win-label>
        {single && shows.length > 1 && <b className="wl-count">{step.index + 1}/{shows.length}</b>}
        {isTotal && shows.length > 1 ? totalText(shows) : showText(drawn[0]!)}
      </span>
      <span className="sr-only">Wins: {summary}</span>
    </div>
  );
}
