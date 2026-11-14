/**
 * SS1 (Slot Scout): honest "how it plays" tags for every lobby card and each game's first-load card.
 * Every figure comes from the frozen math in gameMath.ts (exact enumeration / DP, Monte Carlo only where
 * gameMath already says so). No marketing copy, no "hot"/"due" wording, nothing about the next spin.
 */
import {
  gameMath,
  SUNDOWN_MATH,
  ANTLER_MATH,
  BUCKSHOT_MATH,
  BOUNTY_MATH,
  MINE_MATH,
  PRAIRIE_MATH,
  CLOVER_MATH,
  type VolBucket,
} from "./gameMath";

export type HowTag = {
  kind: "rtp" | "vol" | "wins" | "pays";
  /** Short chip text, e.g. "Wins ~1 in 5". */
  label: string;
  /** Full sentence for screen readers / title. */
  long: string;
};

export type HowItPlays = {
  id: string;
  volatility: VolBucket | "by-bet";
  tags: HowTag[];
  /** One line: how the bonus (or jackpot) starts, or that there is none. */
  trigger: string;
  /** Plain sentence of the whole thing for aria-labels. */
  aria: string;
};

/** "1 in N" from a per-spin probability, never below 2. Empty for impossible / certain events. */
export function oneIn(p: number): number | null {
  if (!(p > 0) || p >= 1) return null;
  return Math.max(2, Math.round(1 / p));
}

type SlotRates = { hitRate?: number; winRate: number };

const SLOT_RATES: Record<string, SlotRates> = {
  slot: SUNDOWN_MATH,
  vault: { winRate: ANTLER_MATH.winRate },
  buckshot: BUCKSHOT_MATH,
  bounty: BOUNTY_MATH,
  mine: MINE_MATH,
  prairie: PRAIRIE_MATH,
  clover: CLOVER_MATH,
};

const fs = (p: number) => `about 1 in ${oneIn(p)} spins`;

/** Bonus trigger lines, worded from the same rules the reels use (TABLE_TIPS / rules page). */
export const TRIGGERS: Record<string, string> = {
  slot: "No bonus round. Every spin pays from the 9-line paytable.",
  buckshot: "No bonus round. Only the centre line pays; the horseshoe is wild.",
  bounty: "No bonus round. Bonus-funded wins pay out in cash.",
  mine: `3+ dynamite anywhere: free spins with Lantern ×1–×4 (${fs(MINE_MATH.freeSpinsChance)}). Cart on reels 1, 3, 5: Mine Cart pick (${fs(MINE_MATH.pickChance)}).`,
  prairie: `3+ storm clouds: free spins with 2×/3× wilds (${fs(PRAIRIE_MATH.freeSpinsChance)}). 6+ gold coins: Hold & Spin (${fs(PRAIRIE_MATH.holdChance)}).`,
  clover: `3+ kettles: free spins with expanding clovers (${fs(CLOVER_MATH.freeSpinsChance)}). Rainbow on reels 1, 3, 5: Rainbow Wheel (${fs(CLOVER_MATH.wheelChance)}).`,
  vault: "Jackpots are mystery hits on any spin, no symbols needed. Mini, Minor and Major must hit by their caps. Tap a meter for its math.",
  blackjack: "No bonus round. Blackjack pays 3:2; the dealer stands on soft 17.",
  paigow: "No bonus round. Win both hands to win, one hand to push.",
  holdem: "No bonus round. House bots fill the other seats; no rake.",
  roulette: "No bonus round. Red or black wins 18 of 38 spins.",
  craps: "No bonus round. Pass line wins 244 of 495 decisions (49.3%).",
};

export function howItPlays(idOrHref: string): HowItPlays {
  const m = gameMath(idOrHref);
  const tags: HowTag[] = [{ kind: "rtp", label: m.rtpLine, long: m.rtpLine }];
  if (m.volatility === "by-bet") tags.push({ kind: "vol", label: "Volatility by bet", long: "Volatility depends on the bet; see the rules." });
  else tags.push({ kind: "vol", label: `${m.volatility} volatility`, long: `${m.volatility} volatility` });
  const r = SLOT_RATES[m.id];
  if (r) {
    const w = oneIn(r.winRate);
    if (w) tags.push({ kind: "wins", label: `Wins ~1 in ${w}`, long: `Wins more than the bet about 1 in ${w} spins` });
    const h = r.hitRate != null ? oneIn(r.hitRate) : null;
    if (h) tags.push({ kind: "pays", label: `Pays ~1 in ${h}`, long: `Pays something back about 1 in ${h} spins, often less than the bet` });
  }
  const trigger = TRIGGERS[m.id];
  if (!trigger) throw new Error(`no how-it-plays trigger for ${m.id}`);
  const aria = `How it plays: ${tags.map((t) => t.long).join(". ")}. ${trigger}`;
  return { id: m.id, volatility: m.volatility, tags, trigger, aria };
}

/** Words that would turn the tags into marketing or imply a win is coming. Locked out by tests. */
export const BANNED_WORDS = /\b(hot|due|loose|guaranteed?|huge|massive|epic|jackpot city|best odds|can'?t lose|lucky)\b/i;
