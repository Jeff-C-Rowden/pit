"use client";
/** Running net after each bet/payout/refund, oldest first, from ledger rows given newest first. */
export function runningNet(rows: { type: string; amountCents: number }[]): number[] {
  const out: number[] = [0]; let n = 0;
  for (const r of [...rows].reverse()) { if (r.type !== "bet" && r.type !== "payout" && r.type !== "refund") continue; n += r.amountCents; out.push(n); }
  return out;
}
const usd = (c: number) => `${c >= 0 ? "+" : "−"}$${(Math.abs(c) / 100).toFixed(2)}`;
/** A small line of the running session net, drawn from real ledger amounts. Zero line dashed. */
export default function Sparkline({ rows, width = 280, height = 56, label = "Session net" }: { rows: { type: string; amountCents: number }[]; width?: number; height?: number; label?: string }) {
  const pts = runningNet(rows);
  if (pts.length < 2) return null;
  const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts), span = hi - lo || 1, pad = 4;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (pts.length - 1);
  const y = (v: number) => pad + ((hi - v) * (height - pad * 2)) / span;
  const d = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = pts[pts.length - 1]!;
  const tone = last > 0 ? "pos" : last < 0 ? "neg" : "flat";
  return (
    <figure className={`sparkline ${tone}`}>
      <figcaption><span>{label}</span><b>{usd(last)}</b></figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img"
        aria-label={`${label}: ${pts.length - 1} ledger rows, now ${usd(last)}, low ${usd(lo)}, high ${usd(hi)}`}>
        <line x1={pad} x2={width - pad} y1={y(0)} y2={y(0)} className="zero" />
        <path d={`${d}L${x(pts.length - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`} className="area" />
        <path d={d} className="line" />
        <circle cx={x(pts.length - 1)} cy={y(last)} r="3.2" className="dot" />
      </svg>
      <p className="lim-help">From your ledger, one step per bet or payout. Sandbox chips.</p>
    </figure>
  );
}
