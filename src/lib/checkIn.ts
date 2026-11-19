/**
 * SS5 — opt-in check-ins. Pure helpers for the calm check-in card (src/components/RealityCheck.tsx).
 *
 * Two triggers, both OFF unless the player turns them on in the Cage (/wallet#time), both stored on the
 * server with the same cooling-off rules as the other time settings:
 *   - time:   every N minutes of this session (the existing reality-check setting)
 *   - budget: each time this session's net loss reaches a multiple of the budget the player chose
 * Every figure comes from the server's ledger-derived session (minutes since the first bet of the run,
 * net = payouts + refunds − bets in sandbox cash). Nothing is estimated, and there is no countdown.
 */
export type CheckInAck = { t: number; b: number };
export type CheckInInput = {
  active: boolean;
  minutes: number;
  netCents: number;
  everyMin: number | null;
  budgetCents: number | null;
  ack: CheckInAck;
};
export type CheckInDue = { time: boolean; budget: boolean; t: number; b: number };

/** How many full time intervals this session has reached (0 = none yet, or check-ins off). */
export function timeBlock(minutes: number, everyMin: number | null): number {
  return everyMin && everyMin > 0 && minutes > 0 ? Math.floor(minutes / everyMin) : 0;
}
/** How many whole budgets this session's net LOSS has reached. A positive or even net never counts. */
export function budgetBlock(netCents: number, budgetCents: number | null): number {
  return budgetCents && budgetCents > 0 && netCents < 0 ? Math.floor(-netCents / budgetCents) : 0;
}
/** The card shows when a new time interval or a new budget step is reached since the last "Keep playing". */
export function checkInDue(i: CheckInInput): CheckInDue | null {
  if (!i.active) return null;
  const t = timeBlock(i.minutes, i.everyMin);
  const b = budgetBlock(i.netCents, i.budgetCents);
  const time = t >= 1 && t > i.ack.t;
  const budget = b >= 1 && b > i.ack.b;
  return time || budget ? { time, budget, t, b } : null;
}
/** "Keep playing" remembers both counters, so the card waits for the next interval or budget step. */
export function ackFor(due: CheckInDue, prev: CheckInAck): CheckInAck {
  return { t: Math.max(prev.t, due.t), b: Math.max(prev.b, due.b) };
}
/** Reads the stored acknowledgement (new JSON form, or the old reality-check number). */
export function parseAck(raw: string | null, legacy: string | null): CheckInAck {
  try {
    const j = raw ? JSON.parse(raw) : null;
    if (j && Number.isFinite(j.t) && Number.isFinite(j.b)) return { t: Math.max(0, Math.floor(j.t)), b: Math.max(0, Math.floor(j.b)) };
  } catch { /* fall through */ }
  const n = Number(legacy || 0);
  return { t: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0, b: 0 };
}
export const ackKey = (startedAt: string) => `pit.checkin.${startedAt}`;
export const legacyAckKey = (startedAt: string) => `pit.rc.${startedAt}`;

const usd = (c: number) => `$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Signed net exactly as the ledger has it: +$1.25, −$27.40, $0.00. */
export function fmtNet(cents: number): string {
  return cents > 0 ? `+${usd(cents)}` : cents < 0 ? `−${usd(cents)}` : usd(0);
}
export function fmtPlayed(m: number): string {
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr ${m % 60} min`;
}
export const budgetLabel = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export const CHECKIN_COPY = {
  title: "Check-in",
  played: "Time played",
  net: "Session net",
  timeWhy: (every: number) => `You asked for a check-in every ${every} min.`,
  budgetWhy: (budgetCents: number) => `You set a session budget check-in of ${budgetLabel(budgetCents)}, and this session's net has reached it.`,
  source: "Both figures come from your ledger for this session: payouts minus bets, sandbox chips only.",
  calm: "There's no timer on this card. Take whatever time you like.",
  breakHelp: "Take a break pauses new bets for 30 minutes, starting now. Anything already in play still finishes.",
  keep: "Keep playing",
  pause: "Take a break",
  limits: "Limits & breaks",
  help: "Help: 1-800-GAMBLER · 21+",
};
