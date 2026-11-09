/** Pure helpers for the always-visible session strip. Everything derives from real ledger rows. */
export const BREAK_NUDGE_MIN = 30;
export type StripRow = { type: string; amountCents: number };

/** Bets placed this session = real 'bet' ledger rows (refunds and payouts are not bets). */
export function countBets(rows: StripRow[]): number {
  return rows.filter((r) => r.type === "bet").length;
}
/** Net = payouts + refunds − bets, straight from the ledger amounts (bets are negative). */
export function netFromRows(rows: StripRow[]): number {
  return rows.reduce((n, r) => (r.type === "bet" || r.type === "payout" || r.type === "refund" ? n + r.amountCents : n), 0);
}
/** Which 30-minute block the player has reached (0 = none yet). */
export function nudgeBlock(minutes: number, every = BREAK_NUDGE_MIN): number {
  return minutes > 0 ? Math.floor(minutes / every) : 0;
}
/** Show the gentle reminder only when a new block is reached and it hasn't been dismissed. */
export function nudgeDue(minutes: number, dismissedBlock: number, every = BREAK_NUDGE_MIN): boolean {
  const b = nudgeBlock(minutes, every);
  return b >= 1 && b > dismissedBlock;
}
export function fmtMinutes(m: number): string {
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr ${m % 60} min`;
}
