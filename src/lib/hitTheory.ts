/**
 * Jackpot Desk JD4 — theory vs actual in the Antler Ridge hit history.
 *
 * Theory comes straight from the live tier config (VS_TIERS in
 * src/lib/games/slotProgressive.ts) and the real hit model in
 * src/lib/progressive.ts (see the JD1 header in src/lib/nextSpinOdds.ts):
 *
 * Must-hit-by tiers (Mini / Minor / Major), seed S, ceiling C, rate r = bps / 10,000:
 * - rollTriggerCents draws the hidden trigger T uniformly on the integers [S, C];
 *   the award is the meter when it first reaches T, i.e. T plus less than one
 *   spin's contribution (a few cents at most).
 *   Expected hit = (S + C) / 2, SD = sqrt(((C - S + 1)^2 - 1) / 12).
 * - Each bet adds r x bet to the meter on average (splitContributionUnbiased),
 *   so the coin-in that lifts the meter from S to T is (T - S) / r:
 *   Expected coin-in per hit = (C - S) / (2r), SD = (C - S) / (r x sqrt(12))
 *   (plus about half of one bet from the spin that crosses T).
 *
 * Grand (mystery, no ceiling), M = mysteryCoinInPerHitCents:
 * - Each spin hits with chance bet / M, so coin-in per hit is (very nearly)
 *   exponential with mean M and SD M.
 * - The award is the seed plus r of that coin-in: expected S + r x M, SD r x M.
 *
 * Actual = plain average over the last 50 REAL hits per tier (progressive_hits).
 * Coin-in actuals use only hits whose cycle coin-in was recorded (tracking
 * started with JD4; older hits have none and are never back-filled or guessed).
 * Fewer than 20 usable hits → "Not enough hits yet". A gap of more than 3
 * standard errors (SD / sqrt(n)) is flagged in neutral words; it never changes
 * any odds and is not a prediction.
 */

import { VS_TIERS, type TierDef } from "./games/slotProgressive";
import { compactDollars } from "./mhbBar";

export const THEORY_WINDOW = 50;
export const THEORY_MIN_HITS = 20;
export const THEORY_DRIFT_SE = 3;
export const THEORY_NOT_ENOUGH = "Not enough hits yet";

export type TierTheory = {
  tierId: string;
  name: string;
  kind: "must-hit" | "mystery";
  hitMeanCents: number;
  hitSdCents: number;
  coinInMeanCents: number;
  coinInSdCents: number;
};

/** Theory for one tier, from its live config. */
export function tierTheory(t: TierDef): TierTheory {
  const r = t.contributionBps / 10_000;
  if (t.ceilingCents != null) {
    const S = t.seedCents;
    const C = t.ceilingCents;
    const span = C - S;
    return {
      tierId: t.id,
      name: t.name,
      kind: "must-hit",
      hitMeanCents: (S + C) / 2,
      hitSdCents: Math.sqrt(((span + 1) ** 2 - 1) / 12),
      coinInMeanCents: span / (2 * r),
      coinInSdCents: span / (r * Math.sqrt(12)),
    };
  }
  const M = t.mysteryCoinInPerHitCents;
  if (M == null) throw new Error(`tier ${t.id} has neither a ceiling nor a mystery rate`);
  return {
    tierId: t.id,
    name: t.name,
    kind: "mystery",
    hitMeanCents: t.seedCents + r * M,
    hitSdCents: r * M,
    coinInMeanCents: M,
    coinInSdCents: M,
  };
}

export const ALL_TIER_THEORY: TierTheory[] = VS_TIERS.map(tierTheory);

export type HitSampleLike = {
  tierId?: string | null;
  amountCents?: number | null;
  coinInCents?: number | null;
  at?: string | null;
};

export type MetricCompare = {
  label: string;
  theoryCents: number;
  theoryLabel: string;
  /** Usable real hits in the window for this metric. */
  n: number;
  enough: boolean;
  actualCents: number | null;
  actualLabel: string;
  seCents: number | null;
  /** (actual - theory) / SE, null when not enough hits. */
  z: number | null;
  drift: boolean;
  /** One neutral status line. */
  status: string;
};

export type TierCompare = {
  tierId: string;
  name: string;
  kind: TierTheory["kind"];
  hit: MetricCompare;
  coinIn: MetricCompare;
};

/** Whole dollars for big figures, cents kept under $1,000. */
export function money(cents: number): string {
  const c = Math.round(cents);
  return compactDollars(Math.abs(c) >= 100_000 ? Math.round(c / 100) * 100 : c);
}

function compare(label: string, theory: number, sd: number, values: number[]): MetricCompare {
  const n = values.length;
  const enough = n >= THEORY_MIN_HITS;
  const base = { label, theoryCents: theory, theoryLabel: money(theory), n, enough };
  if (!enough) {
    return {
      ...base,
      actualCents: null,
      actualLabel: "—",
      seCents: null,
      z: null,
      drift: false,
      status: `${THEORY_NOT_ENOUGH} (${n} of ${THEORY_MIN_HITS} real hits)`,
    };
  }
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const se = sd / Math.sqrt(n);
  const z = se > 0 ? (mean - theory) / se : 0;
  const drift = Math.abs(z) > THEORY_DRIFT_SE;
  return {
    ...base,
    actualCents: mean,
    actualLabel: money(mean),
    seCents: se,
    z,
    drift,
    status: drift
      ? `Over the last ${n} hits the average sits more than ${THEORY_DRIFT_SE} standard errors from theory. Worth a check of the math; it does not change any odds.`
      : `Over the last ${n} hits the average is within ${THEORY_DRIFT_SE} standard errors of theory.`,
  };
}

function valid(h: unknown): h is HitSampleLike & { tierId: string; amountCents: number } {
  if (!h || typeof h !== "object") return false;
  const r = h as HitSampleLike;
  return typeof r.tierId === "string" && typeof r.amountCents === "number" && Number.isFinite(r.amountCents) && r.amountCents > 0;
}

/**
 * Theory vs actual for every tier, from real hit samples only (newest first
 * if `at` is present; at most THEORY_WINDOW per tier). Malformed rows dropped.
 */
export function buildTheoryCompare(samples: unknown, theories: readonly TierTheory[] = ALL_TIER_THEORY): TierCompare[] {
  const list = Array.isArray(samples) ? samples.filter(valid) : [];
  return theories.map((th) => {
    const mine = list
      .filter((h) => h.tierId === th.tierId)
      .sort((a, b) => (Date.parse(b.at ?? "") || 0) - (Date.parse(a.at ?? "") || 0))
      .slice(0, THEORY_WINDOW);
    const coin = mine
      .map((h) => h.coinInCents)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
    return {
      tierId: th.tierId,
      name: th.name,
      kind: th.kind,
      hit: compare("Average hit", th.hitMeanCents, th.hitSdCents, mine.map((h) => h.amountCents)),
      coinIn: compare("Coin-in per hit", th.coinInMeanCents, th.coinInSdCents, coin),
    };
  });
}

/** How the theory figure is worked out, per tier kind (shown under the table). */
export function theoryExplainer(th: TierTheory, def?: TierDef): string {
  const d = def ?? VS_TIERS.find((t) => t.id === th.tierId);
  const pct = d ? `${(d.contributionBps / 100).toFixed(d.contributionBps % 100 ? 1 : 0)}%` : "its share";
  if (th.kind === "must-hit" && d?.ceilingCents != null) {
    return `Theory: the hidden must-hit point is spread evenly from ${compactDollars(d.seedCents)} to ${compactDollars(d.ceilingCents)}, so the average hit is halfway; each bet adds ${pct} of coin-in to this meter.`;
  }
  const M = d?.mysteryCoinInPerHitCents;
  return `Theory: each spin pays the Grand with chance bet ÷ ${M ? money(M) : "its coin-in per hit"}; each bet adds ${pct} of coin-in on top of the ${d ? compactDollars(d.seedCents) : ""} seed.`;
}

export const THEORY_NOTE =
  "Actual is the plain average of the last 50 real hits. Coin-in counts only hits recorded since tracking began. " +
  "Small samples swing widely; past hits do not change the odds of the next spin.";
