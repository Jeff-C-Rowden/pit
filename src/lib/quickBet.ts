/**
 * Quick-bet helpers for phone docks (backlog #7): remember the last bet the
 * server actually accepted per table, and decide whether a one-tap
 * "Repeat" is offered. Pure — no DOM, no ledger. The server still validates
 * every spin (balance, limits, pause/exclusion); this only avoids offering a
 * repeat we already know can't be afforded.
 */
export const LAST_BET_KEY = "pit.lastBet.v1";

/** Coin chips shown on the slot docks (cents per line). */
export const SLOT_COIN_CHIPS = [25, 50, 100, 250, 500] as const;
export const SLOT_COIN_MIN = 25;
export const SLOT_COIN_MAX = 5000;
export const SLOT_LINES = 9;

export type LastBets = Record<string, number>;

/**
 * Table bet docks (backlog #7 follow-up): same quick row, one bet per hand
 * (lines = 1). Ranges mirror the server checks in startBlackjack/startPaiGow.
 */
export const TABLE_QUICK = {
  blackjack: { chips: [500, 1000, 2500, 5000, 10000], min: 100, max: 500_000 },
  paigow: { chips: [500, 1000, 2500, 5000, 10000], min: 500, max: 500_000 },
} as const;
export type QuickTable = keyof typeof TABLE_QUICK;

/** Valid stored-bet range for a game key (slots use the coin range). */
export function lastBetRange(game: string): { min: number; max: number } {
  const t = (TABLE_QUICK as Record<string, { min: number; max: number }>)[game];
  return t ? { min: t.min, max: t.max } : { min: SLOT_COIN_MIN, max: SLOT_COIN_MAX };
}

function validCoin(n: unknown, min: number, max: number): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
}

/**
 * Parse stored last bets; drops anything malformed or out of range. Without
 * explicit bounds each game key is checked against its own range, so a $50
 * blackjack bet and a 25¢ slot coin can live side by side.
 */
export function parseLastBets(raw: string | null | undefined, min?: number, max?: number): LastBets {
  if (!raw) return {};
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return {}; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: LastBets = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[a-z-]{1,24}$/.test(k)) continue;
    const r = min != null && max != null ? { min, max } : lastBetRange(k);
    if (validCoin(n, r.min, r.max)) out[k] = n;
  }
  return out;
}

/** Record a server-accepted bet; returns the new serialized value. */
export function recordLastBet(raw: string | null | undefined, game: string, coinCents: number, min?: number, max?: number): string {
  const cur = parseLastBets(raw);
  const r = min != null && max != null ? { min, max } : lastBetRange(game);
  if (validCoin(coinCents, r.min, r.max)) cur[game] = coinCents;
  return JSON.stringify(cur);
}

export type RepeatState =
  | { show: false }
  | { show: true; enabled: boolean; coinCents: number; totalCents: number; label: string; reason: string | null };

/**
 * Should the dock offer "Repeat"? Only when there is a remembered accepted
 * bet that differs from the current selection (otherwise Spin already is the
 * repeat). Disabled while busy or when the known balance can't cover it —
 * never auto-shrinks or tops up the bet.
 */
export function repeatBetState(opts: {
  lastCoinCents: number | null | undefined;
  currentCoinCents: number;
  balanceCents: number;
  lines?: number;
  busy?: boolean;
  min?: number;
  max?: number;
}): RepeatState {
  const { lastCoinCents, currentCoinCents, balanceCents, busy = false } = opts;
  const lines = opts.lines ?? SLOT_LINES;
  const min = opts.min ?? SLOT_COIN_MIN;
  const max = opts.max ?? SLOT_COIN_MAX;
  if (!validCoin(lastCoinCents, min, max) || lastCoinCents === currentCoinCents) return { show: false };
  const totalCents = lastCoinCents * lines;
  const short = balanceCents < totalCents;
  return {
    show: true,
    enabled: !busy && !short,
    coinCents: lastCoinCents,
    totalCents,
    label: `Repeat ${fmt(totalCents)}`,
    reason: short ? `Needs ${fmt(totalCents)} in sandbox chips` : null,
  };
}

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
