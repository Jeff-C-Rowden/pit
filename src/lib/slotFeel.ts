// Shared reel settle timings for Sundown Trail + Antler Ridge.
// Turbo only shortens animation; outcomes still come from the server after the spin request.

export const SLOT_STOP_MS_NORMAL = [2400, 3000, 3600, 4200, 4800] as const;
/** ~40% of normal, still staggered left→right. */
export const SLOT_STOP_MS_TURBO = [900, 1100, 1300, 1500, 1700] as const;

export const SLOT_BLUR_MS_NORMAL = 85;
export const SLOT_BLUR_MS_TURBO = 50;

/** Per-device Turbo toggle shared by both slot cabinets (roulette uses pit-rl-turbo). */
export const SLOT_TURBO_KEY = "pit-slot-turbo";

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
