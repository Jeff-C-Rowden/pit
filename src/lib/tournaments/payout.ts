/**
 * Tournament money math (pure). JEFF DECISIONS: a flat 25% house fee on every paid buy-in and
 * rebuy; prize pool = (entries + rebuys) × buy-in × 0.75 (+ the house seed on freerolls).
 * Never cancelled, no minimum entrants. Paid places scale with the number of qualified
 * entrants, top 10 at most.
 */
export const FEE_BPS = 2500;
export const FREEROLL_DAILY_CAP_CENTS = 5000;

export type Pool = { grossCents: number; feeCents: number; seedCents: number; poolCents: number };

/** Prize pool from paid entries and rebuys (each rebuy costs the buy-in). */
export function prizePool(paidEntries: number, rebuys: number, buyinCents: number, seedCents = 0, feeBps = FEE_BPS): Pool {
  for (const [k, v] of Object.entries({ paidEntries, rebuys, buyinCents, seedCents, feeBps })) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`${k} must be a non-negative integer`);
  }
  const gross = (paidEntries + rebuys) * buyinCents;
  const net = Math.floor((gross * (10000 - feeBps)) / 10000);
  return { grossCents: gross, feeCents: gross - net, seedCents, poolCents: net + seedCents };
}

/** Split one buy-in for display: "$5.00 = $3.75 to the prize pool + $1.25 house fee". */
export function feeSplit(buyinCents: number, feeBps = FEE_BPS) {
  const toPool = Math.floor((buyinCents * (10000 - feeBps)) / 10000);
  return { toPoolCents: toPool, feeCents: buyinCents - toPool };
}

/**
 * Brackets by qualified count Q: [minQ, splits in bps]. Every row sums to 10,000.
 * The 11–15 and 16–20 rows are flattened from the spec so that, after the 25% fee, the last
 * paid place always gets at least the buy-in back (locked by a test).
 */
export const BRACKETS: readonly (readonly [number, readonly number[]])[] = [
  [1, [10000]],
  [6, [6500, 3500]],
  [8, [5000, 3000, 2000]],
  [11, [4200, 2600, 1900, 1300]],
  [16, [3800, 2400, 1700, 1200, 900]],
  [21, [3500, 2200, 1500, 1100, 900, 800]],
  [36, [3000, 2000, 1400, 1000, 800, 700, 600, 500]],
  [51, [2800, 1800, 1300, 1000, 800, 600, 500, 450, 400, 350]],
];

export function bracketFor(q: number): readonly number[] {
  if (!Number.isInteger(q) || q < 1) return [];
  let out: readonly number[] = BRACKETS[0]![1];
  for (const [min, bps] of BRACKETS) if (q >= min) out = bps;
  return out;
}

/**
 * Prizes for places 1..n given the pool and qualified count Q. Floors each place, then puts the
 * leftover cents on 1st. Σ = pool exactly; non-increasing; ≤ 10 places; never more places than Q.
 */
export function ladder(poolCents: number, q: number): number[] {
  if (!Number.isInteger(poolCents) || poolCents < 0) throw new Error("pool must be a non-negative integer");
  const bps = bracketFor(q);
  if (!bps.length) return [];
  const places = Math.min(bps.length, q);
  const used = bps.slice(0, places);
  const unused = bps.slice(places).reduce((a, b) => a + b, 0);
  const shares = used.map((b, i) => (i === 0 ? b + unused : b));
  const prizes = shares.map((b) => Math.floor((poolCents * b) / 10000));
  prizes[0]! += poolCents - prizes.reduce((a, b) => a + b, 0);
  return prizes;
}

/** "2–5 → 1 · 6–7 → 2 · …" for the detail page. */
export function ladderLegend(): string {
  return BRACKETS.map(([min, bps], i) => {
    const next = BRACKETS[i + 1]?.[0];
    const range = next ? (next - 1 === min ? `${min}` : `${min}–${next - 1}`) : `${min}+`;
    return `${range} → ${bps.length}`;
  }).join(" · ");
}
