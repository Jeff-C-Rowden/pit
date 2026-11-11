/** SD of net result per $1 bet → Low / Medium / High. Matches RTP_AUDIT.md and Jeff's scale. */
export type VolBucket = "Low" | "Medium" | "High";

export function volBucket(sdPerUnit: number): VolBucket {
  if (sdPerUnit < 3) return "Low";
  if (sdPerUnit <= 8) return "Medium";
  return "High";
}

/** "wins about 1 in N spins" from a net-profit frequency. Never implies a win is due. */
export function winsAbout(winRate: number, unit = "spins"): string {
  if (!(winRate > 0) || winRate >= 1) return "";
  const n = Math.max(2, Math.round(1 / winRate));
  return `wins about 1 in ${n} ${unit}`;
}

export const VOL_TIP =
  "Low means frequent small wins. High means rarer, bigger hits. These are long-run figures, not a prediction of the next spin.";
