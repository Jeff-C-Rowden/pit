import { VS_TIERS, type TierDef } from "./games/slotProgressive";

/**
 * JD1 — live next-spin odds under each Antler Ridge meter, derived from the
 * real model in src/lib/progressive.ts (applyProgressiveSpin / rollTriggerCents):
 *
 * Must-hit-by tiers (Mini / Minor / Major):
 * - At each reseed the server draws a hidden integer trigger T uniformly from
 *   [seed, ceiling] (both ends included).
 * - Every spin first adds this tier's contribution c to the meter, then the
 *   tier hits if (meter + c) >= T.
 * - c is drawn by splitContributionUnbiased: floor(bet x bps / 10,000) cents,
 *   plus one more cent with probability equal to the dropped fraction, so E[c]
 *   is exactly bet x bps / 10,000 (= r x b).
 * - The meter only goes up between hits, so a meter showing V after at least
 *   one checked spin tells you exactly T > V: T is uniform on (V, ceiling],
 *   N = ceiling - V equally likely values. Straight after a reseed (V = seed,
 *   no spin checked yet) T is uniform on [seed, ceiling], N = ceiling - seed + 1.
 *   Every Antler Ridge bet adds at least 1 cent to every tier, so a meter above
 *   its seed has always been checked at least once.
 * - P(hit this spin) = E[min(c + d, N)] / N, with d = 0 normally and d = 1 at a
 *   fresh reseed. When c + d <= N this is exactly (r x b + d) / (ceiling - V + d),
 *   i.e. r*b/(C-V) — and it is capped at 1 (the spin that reaches the ceiling).
 *
 * Grand (no ceiling): each spin hits when randInt(M) < bet, M =
 * mysteryCoinInPerHitCents, so P = bet / M exactly, the same every spin.
 *
 * All values are exact integer ratios; display rounding only ever shows a
 * chance at or below the true one (never in the player's favour).
 */

export type OddsMeterLike = {
  id: string;
  name: string;
  progressiveCents: number;
  seedCents: number;
  ceilingCents?: number | null;
};

/** Exact probability as an integer ratio num/den (0 <= num <= den). */
export type ExactChance = { num: number; den: number };

export type TierOdds = {
  tierId: string;
  name: string;
  kind: "must-hit" | "mystery";
  chance: ExactChance;
  /** Float value for convenience (tests / sorting). Never used for display rounding. */
  p: number;
  /** Short line under the meter, e.g. "1 in 1,250" or "12%". */
  short: string;
  /** Full accessible sentence. */
  long: string;
};

function tierDef(id: string): TierDef | undefined {
  return VS_TIERS.find((t) => t.id === id);
}

/** Exact chance a must-hit-by tier hits on the next spin at betCents. */
export function mustHitChance(
  meter: { progressiveCents: number; seedCents: number; ceilingCents: number },
  contributionBps: number,
  betCents: number,
): ExactChance {
  const V = Math.floor(meter.progressiveCents);
  const S = Math.floor(meter.seedCents);
  const C = Math.floor(meter.ceilingCents);
  const d = V <= S ? 1 : 0; // fresh reseed: trigger may equal the seed itself
  const lowExclusive = d ? S - 1 : V;
  const N = C - lowExclusive; // equally likely trigger values still possible
  if (N <= 0) return { num: 1, den: 1 };
  const exact = Math.max(0, Math.floor(betCents)) * contributionBps; // 1/10,000 cent
  const base = Math.floor(exact / 10_000);
  const rem = exact - base * 10_000;
  const reach = V - lowExclusive; // 0, or 1 at a fresh reseed
  const lo = Math.min(base + reach, N);
  const hi = Math.min(base + 1 + reach, N);
  const num = (10_000 - rem) * lo + rem * hi;
  const den = 10_000 * N;
  if (num >= den) return { num: 1, den: 1 };
  return { num, den };
}

/** Exact Grand mystery chance per spin: randInt(M) < bet. */
export function mysteryChance(coinInPerHitCents: number, betCents: number): ExactChance {
  const b = Math.max(0, Math.floor(betCents));
  if (b >= coinInPerHitCents) return { num: 1, den: 1 };
  return { num: b, den: coinInPerHitCents };
}

const fmtInt = (n: number) => n.toLocaleString("en-US");

/**
 * Conservative display. >= 10%: whole percent rounded DOWN; 1–10%: one decimal rounded DOWN. Below 1%: "1 in N"
 * with N rounded UP (so 1/N <= true chance). 100% only when the hit is certain.
 */
export function formatChance(c: ExactChance): string {
  if (c.num <= 0) return "0%";
  if (c.num >= c.den) return "100%";
  if (c.num * 10 >= c.den) return `${Math.floor((c.num * 100) / c.den)}%`;
  if (c.num * 100 >= c.den) return `${(Math.floor((c.num * 1_000) / c.den) / 10).toFixed(1)}%`;
  return `1 in ${fmtInt(Math.ceil(c.den / c.num))}`;
}

/** The chance a displayed string claims (for tests): must be <= the true chance. */
export function shownChanceValue(s: string): number {
  const pct = s.match(/^(\d+(?:\.\d)?)%$/);
  if (pct) return Number(pct[1]) / 100;
  const one = s.match(/^1 in ([\d,]+)$/);
  if (one) return 1 / Number(one[1]!.replace(/,/g, ""));
  throw new Error(`unrecognised chance ${s}`);
}

export function tierNextSpinOdds(meter: OddsMeterLike, betCents: number): TierOdds | null {
  const def = tierDef(meter.id);
  if (!def) return null;
  let chance: ExactChance;
  let kind: TierOdds["kind"];
  if (def.ceilingCents != null && meter.ceilingCents != null) {
    kind = "must-hit";
    chance = mustHitChance(
      { progressiveCents: meter.progressiveCents, seedCents: meter.seedCents, ceilingCents: meter.ceilingCents },
      def.contributionBps,
      betCents,
    );
  } else if (def.mysteryCoinInPerHitCents != null) {
    kind = "mystery";
    chance = mysteryChance(def.mysteryCoinInPerHitCents, betCents);
  } else {
    return null;
  }
  const short = formatChance(chance);
  const long =
    chance.num >= chance.den
      ? `${def.name}: this spin reaches the must-hit-by ceiling, so it pays on this spin at this bet.`
      : kind === "mystery"
        ? `${def.name}: chance this spin pays it is ${short} at this bet. Fixed per dollar bet; it never changes with the meter.`
        : `${def.name}: chance this spin pays it is ${short} at this bet, from the meter now and the hidden must-hit point.`;
  return { tierId: def.id, name: def.name, kind, chance, p: chance.num / chance.den, short, long };
}

export function allNextSpinOdds(meters: OddsMeterLike[], betCents: number): TierOdds[] {
  const out: TierOdds[] = [];
  for (const m of meters) {
    const o = tierNextSpinOdds(m, betCents);
    if (o) out.push(o);
  }
  return out;
}

/** Plain note shown once beside the odds. Neutral wording only. */
export const NEXT_SPIN_NOTE =
  "Chance the next spin pays each pot at your current bet. Every spin has this chance; losing spins do not add to it. " +
  "Only the meter itself moves the Mini/Minor/Major odds; the Grand stays the same per dollar bet. " +
  "Other players' spins can move the meters first. Sandbox / test chips.";

export const BANNED_ODDS_WORDS = ["due", "hot", "almost", "about to hit", "overdue", "close", "soon", "ready", "lucky", "streak"];
