/**
 * Jackpot Desk J1 — must-hit-by (MHB) ceiling bar.
 *
 * A thin seed→ceiling progress bar under each capped Canopy Spire meter, with
 * honest copy built from the real configured ceiling ("Hits by $1,000"). The
 * fill is only ever (current − seed) / (ceiling − seed) of the REAL meter value
 * — it is a position on a fixed range, never a prediction. The hidden trigger is
 * never exposed and no "due / hot / about to hit" wording is used. Uncapped
 * tiers (Grand, mystery only) get no bar.
 */

export type MhbMeterLike = {
  seedCents: number;
  ceilingCents?: number | null;
};

export type MhbBar = {
  /** 0..1 position of the meter between seed and ceiling. */
  fraction: number;
  /** Whole percent for CSS width / aria-valuenow. */
  percent: number;
  ceilingCents: number;
  seedCents: number;
  /** Short visible copy, e.g. "Hits by $1,000". */
  label: string;
  /** Longer screen-reader / tooltip copy. */
  ariaLabel: string;
};

/** Wording the bar must never use (checked in tests). */
export const MHB_BANNED_WORDS = /\b(due|hot|about to hit|overdue|ready to pop|any second)\b/i;

/** "$1,000" for whole dollars, "$12.50" otherwise. */
export function compactDollars(cents: number): string {
  const abs = Math.abs(Math.trunc(cents));
  const d = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const c = abs % 100;
  return `${cents < 0 ? "-" : ""}$${d}${c ? `.${c.toString().padStart(2, "0")}` : ""}`;
}

/** Pure fraction of seed→ceiling, clamped to [0, 1]. */
export function mhbFraction(currentCents: number, seedCents: number, ceilingCents: number): number {
  if (![currentCents, seedCents, ceilingCents].every(Number.isFinite)) return 0;
  const span = ceilingCents - seedCents;
  if (span <= 0) return currentCents >= ceilingCents ? 1 : 0;
  const f = (currentCents - seedCents) / span;
  return Math.min(1, Math.max(0, f));
}

export function mhbLabel(ceilingCents: number): string {
  return `Hits by ${compactDollars(ceilingCents)}`;
}

/**
 * Bar model for one meter, or null when the tier has no must-hit-by ceiling.
 * `shownCents` should be the value actually on screen (so a J4 reseed moment,
 * which shows the seed, renders an empty bar).
 */
export function mhbBar(meter: MhbMeterLike, shownCents: number): MhbBar | null {
  const ceiling = meter.ceilingCents;
  if (ceiling == null || !Number.isFinite(ceiling) || ceiling <= 0) return null;
  const seed = Number.isFinite(meter.seedCents) ? meter.seedCents : 0;
  const fraction = mhbFraction(shownCents, seed, ceiling);
  const label = mhbLabel(ceiling);
  const ariaLabel =
    `Must-hit-by ceiling: this sandbox pot pays out no later than the spin that takes it to ${compactDollars(ceiling)}. ` +
    `Meter is ${Math.round(fraction * 100)}% of the way from ${compactDollars(seed)} to ${compactDollars(ceiling)}.`;
  return { fraction, percent: Math.round(fraction * 100), ceilingCents: ceiling, seedCents: seed, label, ariaLabel };
}
