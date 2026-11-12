"use client";
/**
 * Draws the server's paid wins over the reel window once every reel has landed: a thick glowing
 * line through each winning payline (or a path joining each ways group), a frame on every winning
 * symbol, dimmed non-winning symbols, and a payout label. Several wins cycle one at a time.
 * Purely presentational: it only ever shows wins that are in the spin result.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { reducedMotion } from "@/lib/feel";
import { showIndexAt, showText, WIN_SHOW_DELAY_MS, WIN_SHOW_HOLD_MS, type WinCell, type WinShow } from "@/lib/winShow";

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

export default function WinLineOverlay({ shows, active }: { shows: WinShow[]; active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [idx, setIdx] = useState(-1);
  const [reduced, setReduced] = useState(false);
  const sig = useMemo(() => shows.map((s) => `${s.key}:${s.winCents}:${s.cells.map((c) => `${c.reel}${c.row}`).join("")}`).join("|"), [shows]);
  const on = active && shows.length > 0;

  useEffect(() => { setReduced(reducedMotion()); }, []);

  // start after the reels settle; cycle; stop the moment a new spin begins (active goes false)
  useEffect(() => {
    setIdx(-1);
    if (!on) return;
    let iv = 0;
    const t0 = { v: 0 };
    const to = window.setTimeout(() => {
      t0.v = performance.now();
      setIdx(0);
      if (shows.length > 1) iv = window.setInterval(() => setIdx(showIndexAt(shows.length, performance.now() - t0.v)), 200);
    }, WIN_SHOW_DELAY_MS);
    return () => { window.clearTimeout(to); if (iv) window.clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, sig]);

  useLayoutEffect(() => {
    if (!on || idx < 0) return;
    const host = hostRef.current;
    if (!host) return;
    const sync = () => setGeo(measure(host));
    sync();
    const win = host.parentElement;
    const ro = typeof ResizeObserver !== "undefined" && win ? new ResizeObserver(sync) : null;
    if (ro && win) ro.observe(win);
    window.addEventListener("resize", sync);
    return () => { ro?.disconnect(); window.removeEventListener("resize", sync); };
  }, [on, idx >= 0]);

  const show = on && idx >= 0 ? shows[idx] ?? null : null;
  const summary = on ? shows.map(showText).join("; ") : "";
  if (!show || !geo) {
    return <div ref={hostRef} className="wl-host" aria-hidden={!summary}>{summary && <span className="sr-only">Wins: {summary}</span>}</div>;
  }
  const color = show.kind === "scatter" ? "#ffd23a" : COLORS[(show.kind === "line" ? Number(show.key.replace(/\D/g, "")) || 0 : idx) % COLORS.length]!;
  const hit = new Set(show.cells.map((c) => `${c.reel}-${c.row}`));
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
  const segs = show.segments.map(([a, b], i) => {
    const p = centre(geo, a), q = centre(geo, b);
    if (!p || !q) return null;
    return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
  });
  // a straight polyline for paylines reads better than separate segments (joins are rounded)
  const linePts = show.kind === "line" && show.segments.length
    ? [show.segments[0]![0], ...show.segments.map((s) => s[1])].map((c) => centre(geo, c)).filter(Boolean).map((p) => `${p!.x},${p!.y}`).join(" ")
    : "";
  // label away from the winning cells when possible
  const labelRow = pickLabelRow(show, geo.cols.length, geo.rows);
  return (
    <div ref={hostRef} className={`wl-host on${reduced ? " wl-reduced" : ""}`} data-win-show={show.kind} data-win-index={idx} data-win-count={shows.length} style={{ ["--wl-c" as string]: color }}>
      <svg className="wl-svg" width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden>
        <g className="wl-dims">{dims}</g>
        {show.kind !== "scatter" && (
          <g key={`${show.key}-${idx}`} className="wl-path">
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
        )}
        <g key={`f-${show.key}-${idx}`} className="wl-frames">{frames}</g>
      </svg>
      <span key={`t-${show.key}-${idx}`} className={`wl-label${labelRow === 0 ? " top" : labelRow === 1 ? " mid" : ""}`} data-win-label>
        {shows.length > 1 && <b className="wl-count">{idx + 1}/{shows.length}</b>}
        {showText(show)}
      </span>
      <span className="sr-only">Wins: {summary}</span>
    </div>
  );
}
