/**
 * Ranking modes (pure).
 * - Balance: everyone starts with the same stack; score = stack. Highest stack wins.
 * - Accumulated: only wins count. A round's points are its NET win as a multiple of the stake
 *   (in hundredths), so a bigger bet never buys a bigger score. Losses and pushes add 0.
 */
export type RankMode = "balance" | "accumulated";
export const POINTS_CAP_PER_ROUND = 50_000; // 500× net

export function roundPoints(stakeCents: number, returnCents: number): number {
  if (!Number.isInteger(stakeCents) || stakeCents <= 0) return 0;
  if (!Number.isInteger(returnCents) || returnCents < 0) throw new Error("return must be a non-negative integer");
  const net = Math.max(0, returnCents - stakeCents);
  return Math.min(POINTS_CAP_PER_ROUND, Math.floor((net * 100) / stakeCents));
}

export type Scored = {
  id: string;
  score: number;
  score_reached_at: string | null;
  bets_made: number;
  best_round_points: number;
  wagered_cents: number;
  created_at: string;
};

/** Total order (no shared places): score, who got there first, fewer bets, tie-break 4, entry time, id. */
export function compareEntries(mode: RankMode) {
  return (a: Scored, b: Scored): number => {
    if (a.score !== b.score) return b.score - a.score;
    const ta = a.score_reached_at ?? a.created_at, tb = b.score_reached_at ?? b.created_at;
    if (ta !== tb) return ta < tb ? -1 : 1;
    if (a.bets_made !== b.bets_made) return a.bets_made - b.bets_made;
    if (mode === "accumulated" && a.best_round_points !== b.best_round_points) return b.best_round_points - a.best_round_points;
    if (mode === "balance" && a.wagered_cents !== b.wagered_cents) return a.wagered_cents - b.wagered_cents;
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

/**
 * Board order: qualified entries first (they're the ones who can place), then the rest.
 * Returns each entry with its rank and the prize it would take if the event ended now.
 * If nobody qualified, the top-ranked entrant takes the whole pool (JEFF DECISION: never fizzle).
 */
export function rankBoard<T extends Scored & { bets_made: number }>(entries: T[], mode: RankMode, minQualifying: number, prizes: (q: number) => number[]) {
  const cmp = compareEntries(mode);
  const q = entries.filter((e) => e.bets_made >= minQualifying).sort(cmp);
  const nq = entries.filter((e) => e.bets_made < minQualifying).sort(cmp);
  const ladderNow = q.length ? prizes(q.length) : entries.length ? prizes(1) : [];
  const ordered = [...q, ...nq];
  return {
    qualifiedCount: q.length,
    fallback: q.length === 0 && entries.length > 0,
    ladder: ladderNow,
    rows: ordered.map((e, i) => {
      const qualified = e.bets_made >= minQualifying;
      const prize = q.length ? (qualified ? ladderNow[i] ?? 0 : 0) : i === 0 ? ladderNow[0] ?? 0 : 0;
      return { ...e, rank: i + 1, qualified, prizeCents: prize };
    }),
  };
}

/** "152.40×" for accumulated scores; balance scores are formatted as chips by the caller. */
export function pointsLabel(points: number): string {
  return `${(points / 100).toFixed(2)}×`;
}
