/**
 * Research #5 slice 3: the Canary Creek Mine Lantern Multiplier meter.
 *
 * The meter reads only what the player has already seen: the multiplier a free spin is paid at is
 * 1 + the number of earlier free spins (already shown) that paid anything, capped at x4. Once a spin's
 * result is on screen and it paid, the next lantern is marked "+1 next spin". Nothing here draws or
 * pays anything; the server's per-spin `mult` must always equal this (locked in tests/lanternMeter.test.ts).
 * Pure and client-safe, so a resumed round rebuilds the exact same meter from the saved step.
 */
import { lanternMultAt, MINE_FS_MULT_MAX } from "./games/mine";

type SpinLike = { baseWinCents?: number; winCents: number };

export type LanternMeter = {
  /** Multiplier the spin at `idx` is paid at (1..4). */
  mult: number;
  /** Set when the spin at `idx` is on screen, paid, and the meter has room to climb: the next spin's multiplier. */
  next: number | null;
  /** Free spins shown so far that paid. */
  paidShown: number;
  label: string;
};

const paid = (s: SpinLike | undefined) => !!s && (s.baseWinCents ?? s.winCents) > 0;

export function lanternMeter(spins: readonly SpinLike[], idx: number, shown: boolean): LanternMeter {
  const i = Math.max(0, Math.min(idx, Math.max(0, spins.length - 1)));
  const mult = lanternMultAt(spins as SpinLike[], i);
  const cur = spins[i];
  const next = shown && paid(cur) && mult < MINE_FS_MULT_MAX ? mult + 1 : null;
  const seen = spins.slice(0, shown ? i + 1 : i);
  const paidShown = seen.filter(paid).length;
  const label = `Lantern Multiplier ×${mult} of ×${MINE_FS_MULT_MAX}. ${paidShown} paying free spin${paidShown === 1 ? "" : "s"} shown so far.${next ? ` Next spin pays ×${next}.` : ""}`;
  return { mult, next, paidShown, label };
}
