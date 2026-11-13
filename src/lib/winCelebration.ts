// Backlog #6: one shared, honest win celebration for every slot cabinet.
// Presentation only. The amounts are the server's settled spin result (total paid back on the
// spin, stake included) and the total bet actually risked. Nothing here changes odds or outcomes.
//
// Tier by win ÷ total bet (same cut points as the cabinet glow, slotGlowTier):
//   none  win ≤ bet (no pay, part back or bet back: a net loss or break-even is never celebrated)
//   small more than 1× and under 2×  (plain "WIN" plate, no sparks)
//   nice  2× to under 6×
//   big   6× to under 21×
//   huge  21× and up
// prefers-reduced-motion: the same plate and glow, shown still (no sparks, no pop, no flashing).
// Bonus features: the S5 bookend summary card is that spin's celebration, so the cabinet plate and
// animated lights stay off for feature spins (lights may still sit steady) — nothing fires twice.

export type WinTier = "none" | "small" | "nice" | "big" | "huge";

/** Lowest win ÷ bet multiple for each tier ("small" means strictly more than 1×). */
export const TIER_FLOOR = { small: 1, nice: 2, big: 6, huge: 21 } as const;

export const TIER_TITLE: Record<Exclude<WinTier, "none">, string> = {
  small: "WIN",
  nice: "NICE WIN",
  big: "BIG WIN",
  huge: "HUGE WIN",
};

/** Spark count per tier when motion is allowed. */
export const TIER_SPARKS: Record<WinTier, number> = { none: 0, small: 0, nice: 8, big: 14, huge: 22 };

function cents(v: number | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function winTier(betCents: number | null | undefined, winCents: number | null | undefined): WinTier {
  const bet = cents(betCents), win = cents(winCents);
  if (bet <= 0 || win <= bet) return "none";
  // compare in integer cents so 2× exactly is "nice" with no float drift
  if (win >= bet * TIER_FLOOR.huge) return "huge";
  if (win >= bet * TIER_FLOOR.big) return "big";
  if (win >= bet * TIER_FLOOR.nice) return "nice";
  return "small";
}

/** Cabinet glow level 0–4 for a tier (matches the CSS glow-t1..t4 classes). */
export function tierGlow(tier: WinTier): 0 | 1 | 2 | 3 | 4 {
  return tier === "huge" ? 4 : tier === "big" ? 3 : tier === "nice" ? 2 : tier === "small" ? 1 : 0;
}

/** "8.4× bet" — rounded DOWN to one decimal so a win is never overstated. */
export function multipleText(betCents: number | null | undefined, winCents: number | null | undefined): string {
  const bet = cents(betCents), win = cents(winCents);
  if (bet <= 0) return "";
  const tenths = Math.floor((win * 10) / bet);
  const s = tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
  return `${s}× bet`;
}

function money(c: number): string {
  return `$${Math.floor(c / 100).toLocaleString("en-US")}.${String(c % 100).padStart(2, "0")}`;
}

/** Honest quiet label for a pay that did not beat the bet (null when nothing came back or it was a real win). */
export function returnedText(betCents: number | null | undefined, winCents: number | null | undefined): string | null {
  const bet = cents(betCents), win = cents(winCents);
  if (win <= 0 || bet <= 0 || win > bet) return null;
  return `Returned ${money(win)}`;
}

export type Celebration = {
  tier: WinTier;
  glow: 0 | 1 | 2 | 3 | 4;
  /** Animate the cabinet lights (only with Sound & feel on, no reduced motion, not a feature spin). */
  live: boolean;
  /** The cabinet plate; null when nothing should be celebrated. */
  plate: null | {
    title: string;
    amount: string;
    multiple: string;
    sparks: number;
    /** Pop-in animation allowed. */
    motion: boolean;
  };
  /** Changes on every new result so the one-shot animation replays only for a new spin. */
  key: string;
};

export const NO_CELEBRATION: Celebration = { tier: "none", glow: 0, live: false, plate: null, key: "none" };

export function celebrationFor(opts: {
  betCents: number | null | undefined;
  winCents: number | null | undefined;
  /** The reels have stopped and the result is on show. */
  settled: boolean;
  /** This spin played a bonus feature (the bookend summary already celebrated it). */
  feature?: boolean;
  reduced?: boolean;
  /** Sound & feel on (lights flash only when this is on). */
  feelOn?: boolean;
  /** Anything unique per spin (server spin id, idempotency key or a counter). */
  spinKey?: string | number | null;
}): Celebration {
  if (!opts.settled) return NO_CELEBRATION;
  const tier = winTier(opts.betCents, opts.winCents);
  if (tier === "none") return NO_CELEBRATION;
  const glow = tierGlow(tier);
  const reduced = !!opts.reduced;
  const key = `${opts.spinKey ?? ""}:${cents(opts.betCents)}:${cents(opts.winCents)}`;
  if (opts.feature) return { tier, glow, live: false, plate: null, key };
  return {
    tier,
    glow,
    live: !!opts.feelOn && !reduced,
    plate: {
      title: TIER_TITLE[tier],
      amount: money(cents(opts.winCents)),
      multiple: multipleText(opts.betCents, opts.winCents),
      sparks: reduced ? 0 : TIER_SPARKS[tier],
      motion: !reduced,
    },
    key,
  };
}

/** Evenly spaced spark directions (degrees) and distances; deterministic, no randomness. */
export function sparkLayout(n: number): { angle: number; dist: number; delay: number }[] {
  const out: { angle: number; dist: number; delay: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ angle: Math.round((360 / n) * i), dist: 34 + (i % 3) * 12, delay: (i % 4) * 40 });
  return out;
}
