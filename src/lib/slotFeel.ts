// Shared reel settle timings for every Pit slot cabinet.
// Turbo only shortens animation; outcomes still come from the server after the spin request.
// S1: left-to-right stops ~120ms apart, 4–6px overshoot + settle, no near-miss slowdown.

export const SLOT_STOP_STAGGER_MS = 120;
/** Previous 5-reel last-stop; new totals (including the settle bounce) must not exceed this. */
export const SLOT_PREV_LAST_STOP_MS = 4800;

export const SLOT_BOUNCE_PX = 5;
export const SLOT_SETTLE_MS_NORMAL = 140;
export const SLOT_SETTLE_MS_TURBO = 90;

export const SLOT_STOP_MS_NORMAL = [2400, 2520, 2640, 2760, 2880] as const;
/** First stop stays ~40% of normal; the same 120ms stagger still finishes sooner than normal. */
export const SLOT_STOP_MS_TURBO = [900, 1020, 1140, 1260, 1380] as const;

export const SLOT_BLUR_MS_NORMAL = 85;
export const SLOT_BLUR_MS_TURBO = 50;

/** Per-device Turbo toggle shared by the slot cabinets (roulette uses pit-rl-turbo). */
export const SLOT_TURBO_KEY = "pit-slot-turbo";

/** Left-to-right stop times from a first-reel delay. Never depends on the outcome. */
export function slotStaggerStops(firstMs: number, count: number, staggerMs = SLOT_STOP_STAGGER_MS): number[] {
  const n = Math.max(1, count | 0);
  const first = Math.max(0, Number(firstMs) || 0);
  const gap = Math.max(0, Number(staggerMs) || 0);
  return Array.from({ length: n }, (_, i) => first + i * gap);
}

/** Settle duration for reel `index` (0–4). Turbo is strictly shorter and still staggered. */
export function slotStopMs(reelIndex: number, turbo: boolean): number {
  const table = turbo ? SLOT_STOP_MS_TURBO : SLOT_STOP_MS_NORMAL;
  const i = Math.max(0, Math.min(table.length - 1, reelIndex | 0));
  return table[i]!;
}

/** Blur/filler cycle interval while reels are spinning. */
export function slotBlurCycleMs(turbo: boolean): number {
  return turbo ? SLOT_BLUR_MS_TURBO : SLOT_BLUR_MS_NORMAL;
}

/**
 * Effective turbo for a spin: user toggle OR prefers-reduced-motion.
 * Reduced motion always gets turbo timings without needing the checkbox.
 */
export function slotTurboEffective(userTurbo: boolean, prefersReducedMotion: boolean): boolean {
  return !!userTurbo || !!prefersReducedMotion;
}

export type SlotLandPlan = {
  stopMs: number;
  bouncePx: number;
  settleMs: number;
  totalMs: number;
  slammed: boolean;
};

/** Bounce is presentation only: off when the player slams, or when they prefer reduced motion. */
export function shouldReelBounce(opts: { reducedMotion: boolean; slammed: boolean }): boolean {
  return !opts.reducedMotion && !opts.slammed;
}

/** Fixed per-reel land plan. Options are presentation flags only — never an outcome or near-miss. */
export function slotLandPlan(opts: {
  reelIndex: number;
  turbo: boolean;
  reducedMotion?: boolean;
  slammed?: boolean;
}): SlotLandPlan {
  const slammed = !!opts.slammed;
  const reduced = !!opts.reducedMotion;
  const stopMs = slammed ? 0 : slotStopMs(opts.reelIndex, opts.turbo);
  const bounce = shouldReelBounce({ reducedMotion: reduced, slammed });
  const bouncePx = bounce ? SLOT_BOUNCE_PX : 0;
  const settleMs = bounce ? (opts.turbo ? SLOT_SETTLE_MS_TURBO : SLOT_SETTLE_MS_NORMAL) : 0;
  return { stopMs, bouncePx, settleMs, totalMs: stopMs + settleMs, slammed };
}

/**
 * Target Y plus overshoot in the direction of travel.
 * Reel strips move up (negative Y), so a bounce continues further negative.
 */
export function slotReelOffset(targetPx: number, bouncePx: number): number {
  if (!(bouncePx > 0)) return targetPx;
  const dir = targetPx === 0 ? -1 : Math.sign(targetPx);
  return targetPx + dir * bouncePx;
}
