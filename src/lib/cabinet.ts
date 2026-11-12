/**
 * Physical-cabinet controls for both slots (Sundown Trail, Antler Ridge): Bet −/+,
 * Max Bet, Auto, and the pull handle. Pure — no DOM, no ledger. Every spin still goes
 * through the page's go() → server POST, which checks balance, limits, pause and
 * exclusion. None of this changes odds, paytables or results.
 */
import { SLOT_COIN_CHIPS, SLOT_COIN_MAX, SLOT_COIN_MIN } from "./quickBet";

/** Coin ladder the Bet −/+ buttons walk (cents per line). Max is the published cap. */
export const CAB_COIN_STEPS: readonly number[] = [...SLOT_COIN_CHIPS, 1000, 2500, SLOT_COIN_MAX];

/**
 * Bet −/+ : move one rung on the ladder. A custom coin between rungs moves to the
 * neighbouring rung in that direction. Clamped to the published min/max.
 */
export function stepCoin(coinCents: number, dir: 1 | -1, steps: readonly number[] = CAB_COIN_STEPS): number {
  const c = Math.max(SLOT_COIN_MIN, Math.min(SLOT_COIN_MAX, Math.round(coinCents) || SLOT_COIN_MIN));
  if (dir > 0) return steps.find((s) => s > c) ?? steps[steps.length - 1]!;
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i]! < c) return steps[i]!;
  return steps[0]!;
}

/** Auto plays a short, fixed, visible run — never open-ended. */
export const CAB_AUTO_SPINS = 10;

export type AutoState = { remaining: number };

export type AutoCheck = {
  /** Spins still queued in this Auto run (after the one that just finished). */
  remaining: number;
  balanceCents: number;
  costCents: number;
  /** The last spin was refused or failed (limits, pause, exclusion, network). */
  error: boolean;
  /** A progressive tier hit on the last spin — the player should see it, not race past it. */
  jackpot: boolean;
  /** The player pressed Stop/Auto, or left the tab. */
  cancelled: boolean;
  /** A reality-check or limit note is showing: let the player read it first. */
  realityDue?: boolean;
};

export type AutoDecision = { go: true } | { go: false; reason: "done" | "funds" | "error" | "jackpot" | "cancelled" | "reality" };

/** Whether Auto should start the next spin. Any doubt stops Auto. */
export function autoNext(s: AutoCheck): AutoDecision {
  if (s.cancelled) return { go: false, reason: "cancelled" };
  if (s.error) return { go: false, reason: "error" };
  if (s.jackpot) return { go: false, reason: "jackpot" };
  if (s.realityDue) return { go: false, reason: "reality" };
  if (s.remaining <= 0) return { go: false, reason: "done" };
  if (s.balanceCents < s.costCents) return { go: false, reason: "funds" };
  return { go: true };
}

export function autoStopText(reason: Exclude<AutoDecision, { go: true }>["reason"]): string {
  switch (reason) {
    case "done": return "Auto finished its 10 spins.";
    case "funds": return "Auto stopped: not enough sandbox chips for the next spin.";
    case "error": return "Auto stopped: the last spin was refused.";
    case "jackpot": return "Auto stopped for the jackpot.";
    case "cancelled": return "Auto stopped.";
    case "reality": return "Auto stopped so you can read your reality check.";
  }
}

/** Pull handle: fraction of travel (0–1) that counts as a pull when released. */
export const LEVER_FIRE_AT = 0.55;
/** Pointer moves under this many px count as a tap (tap = full pull). */
export const LEVER_TAP_PX = 6;

/** Travel fraction for a drag of `dy` px down a handle that travels `travelPx`. */
export function leverTravel(dy: number, travelPx: number): number {
  if (!(travelPx > 0)) return 0;
  return Math.max(0, Math.min(1, dy / travelPx));
}

/** Does releasing the handle start a spin? Taps do; drags must pass LEVER_FIRE_AT. */
export function leverFires(dy: number, travelPx: number, movedPx: number): boolean {
  if (Math.abs(movedPx) < LEVER_TAP_PX) return true;
  return leverTravel(dy, travelPx) >= LEVER_FIRE_AT;
}

/** LED meter text: fixed two decimals, thousands grouped, no $ (the label says CREDIT/BET/WIN). */
export function ledText(cents: number): string {
  const v = Math.max(0, Math.round(Number(cents) || 0));
  const whole = Math.floor(v / 100).toLocaleString("en-US");
  return `${whole}.${String(v % 100).padStart(2, "0")}`;
}

/**
 * Belly-glass highlights: the top pays straight from the server paytable
 * (5-of-a-kind × coin), highest first. Never invents or rounds a number.
 */
export function bellyPays(paytable: Record<string, readonly number[]> | null | undefined, n = 3): { sym: string; pay5: number }[] {
  if (!paytable) return [];
  return Object.entries(paytable)
    .filter(([, v]) => Array.isArray(v) && typeof v[2] === "number")
    .map(([sym, v]) => ({ sym, pay5: v[2]! }))
    .sort((a, b) => b.pay5 - a.pay5)
    .slice(0, n);
}

/**
 * Payline number tabs down each side of the reel window, as on a real cabinet:
 * for each row (top, middle, bottom), the 1-based line numbers that start (left)
 * or end (right) on that row. Straight from the game's own payline table.
 */
export function paylineTabs(paylines: readonly (readonly number[])[], side: "left" | "right"): number[][] {
  const rows: number[][] = [[], [], []];
  paylines.forEach((pattern, i) => {
    const row = side === "left" ? pattern[0] : pattern[pattern.length - 1];
    if (row != null && row >= 0 && row < 3) rows[row]!.push(i + 1);
  });
  return rows;
}

/**
 * Max Bet: the largest valid coin the player's usable credit covers for one spin
 * (coin × `coinsPerSpin` ≤ credit), capped at the game's published max coin.
 * Null when even the smallest coin is not covered (the page shows the refusal notice).
 * Credit is whatever that game can spend (cash, plus usable bonus where the game takes it,
 * or the tournament stack). The server still re-checks every spin.
 */
export function maxBetCoin(creditCents: number, coinsPerSpin: number, minCoin = SLOT_COIN_MIN, maxCoin = SLOT_COIN_MAX): number | null {
  const credit = Math.floor(Number(creditCents) || 0);
  const per = Math.max(1, Math.floor(coinsPerSpin) || 1);
  const c = Math.min(maxCoin, Math.floor(credit / per));
  return c >= minCoin ? c : null;
}

/** Classic PLAY MAX (Buckshot / Bounty Bars): the most coins (up to `maxCoins`) at the chosen coin value the credit covers. */
export function playMaxCoins(creditCents: number, denomCents: number, maxCoins = 3): number {
  const d = Math.max(1, Math.floor(denomCents) || 1);
  return Math.max(0, Math.min(maxCoins, Math.floor((Math.floor(Number(creditCents) || 0)) / d)));
}

/** Refusal text when Max Bet finds no covered bet. Mentions the Cage so the notice links there. */
export function maxBetRefusal(creditText: string, smallestText: string): string {
  return `Max bet: your ${creditText} doesn't cover a spin here (smallest bet ${smallestText}). Add sandbox chips in the Cage.`;
}
