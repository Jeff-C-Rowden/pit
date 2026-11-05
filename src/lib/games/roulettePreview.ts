import { coveredBy } from "./rouletteFelt";

const POCKETS = ["0", "00", ...Array.from({ length: 36 }, (_, i) => String(i + 1))];

type PBet = { kind: string; numbers?: string[]; which?: number; amountCents: number };

/** Honest pre-spin preview over all 38 pockets: best return, chance any bet pays, chance of a net gain. */
export function previewBets(bets: PBet[]) {
  const stake = bets.reduce((s, b) => s + b.amountCents, 0);
  const cov = bets.map((b) => ({ amt: b.amountCents, nums: new Set(coveredBy(b)) }));
  let best = 0, anyHit = 0, netWin = 0;
  for (const p of POCKETS) {
    let back = 0;
    for (const c of cov) if (c.nums.has(p) && c.nums.size > 0) back += Math.round((c.amt * 36) / c.nums.size);
    if (back > best) best = back;
    if (back > 0) anyHit++;
    if (back > stake) netWin++;
  }
  return { stakeCents: stake, bestReturnCents: best, hitPockets: anyHit, netWinPockets: netWin, pockets: POCKETS.length };
}
