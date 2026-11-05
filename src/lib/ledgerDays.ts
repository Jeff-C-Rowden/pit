export type DayLine = { at: string; type: string; amountCents: number };

export function toDate(at: string) { return new Date(at.endsWith("Z") || at.includes("T") ? at : at.replace(" ", "T") + "Z"); }

const PLAY = new Set(["bet", "payout", "refund"]);
/** Groups lines by the viewer's local day. Play net = bets + payouts + refunds; cash moves are shown apart. */
export function groupByDay<L extends DayLine>(lines: L[], now = new Date()) {
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today = key(now), y = new Date(now); y.setDate(y.getDate() - 1); const yesterday = key(y);
  const out: { key: string; label: string; playNet: number; cashIn: number; cashOut: number; lines: L[] }[] = [];
  for (const l of lines) {
    const d = toDate(l.at); const k = key(d);
    let g = out.find((x) => x.key === k);
    if (!g) {
      g = { key: k, label: k === today ? "Today" : k === yesterday ? "Yesterday" : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }), playNet: 0, cashIn: 0, cashOut: 0, lines: [] };
      out.push(g);
    }
    g.lines.push(l);
    if (PLAY.has(l.type)) g.playNet += l.amountCents;
    else if (l.amountCents > 0) g.cashIn += l.amountCents;
    else g.cashOut += -l.amountCents;
  }
  return out;
}

