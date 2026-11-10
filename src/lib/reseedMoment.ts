/**
 * Jackpot Desk J4 — visible reseed moment.
 *
 * After a REAL progressive hit (a genuine progressive_hits row, or the hits
 * array the server returned for the player's own spin) the affected meter
 * shows "Won $X · reset to $seed" for ~5 s and holds at its seed before it
 * resumes ticking. Nothing here invents hits: moments are only ever built
 * from server data, and only for hits that arrive while the player watches.
 */
import { formatCents } from "./money";

export const RESEED_MOMENT_MS = 5000;
/** A poll-discovered hit older than this is history, not a "moment". */
export const RESEED_FRESH_MS = 60_000;

export type ReseedMoment = {
  tierId: string;
  tierName: string;
  wonCents: number;
  seedCents: number;
  until: number;
};

export type SpinHitLike = { tierId: string; name: string; awardCents: number; reseedsTo?: number };
export type RecentHitLike = { tier: string; tierId?: string; amountCents: number; at: string };
export type MeterSeedLike = { id: string; name: string; seedCents: number };

function validCents(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && Math.floor(n) === n;
}

/** Stable identity for a real hit row (used to spot hits that are new since last poll). */
export function hitKey(h: RecentHitLike): string {
  return `${h.tierId ?? h.tier}|${h.at}|${h.amountCents}`;
}

/** Moments for the player's own spin, from the server's hits array (call after reels settle). */
export function momentsFromSpinHits(
  hits: SpinHitLike[] | null | undefined,
  meters: MeterSeedLike[],
  nowMs: number,
  durationMs = RESEED_MOMENT_MS,
): ReseedMoment[] {
  if (!Array.isArray(hits)) return [];
  const out: ReseedMoment[] = [];
  for (const h of hits) {
    if (!h || !validCents(h.awardCents)) continue;
    const seed = validCents(h.reseedsTo) ? h.reseedsTo : meters.find((m) => m.id === h.tierId)?.seedCents;
    if (!validCents(seed)) continue;
    out.push({ tierId: h.tierId, tierName: h.name, wonCents: h.awardCents, seedCents: seed, until: nowMs + durationMs });
  }
  return out;
}

/**
 * Diff a poll's recent-hits list against keys already seen. The first poll
 * (seen === null) only records keys: a hit from before the player arrived is
 * shown in history, never replayed as a live moment.
 */
export function momentsFromNewHits(
  seen: Set<string> | null,
  recentHits: RecentHitLike[] | null | undefined,
  meters: MeterSeedLike[],
  nowMs: number,
  opts: { durationMs?: number; freshMs?: number } = {},
): { seen: Set<string>; moments: ReseedMoment[] } {
  const durationMs = opts.durationMs ?? RESEED_MOMENT_MS;
  const freshMs = opts.freshMs ?? RESEED_FRESH_MS;
  const next = new Set(seen ?? []);
  const moments: ReseedMoment[] = [];
  const byTier = new Set<string>();
  for (const h of Array.isArray(recentHits) ? recentHits : []) {
    if (!h || typeof h.at !== "string") continue;
    const key = hitKey(h);
    if (next.has(key)) continue;
    next.add(key);
    if (seen === null) continue;
    const at = Date.parse(h.at);
    if (!Number.isFinite(at) || nowMs - at > freshMs || at - nowMs > freshMs) continue;
    if (!validCents(h.amountCents)) continue;
    const meter = meters.find((m) => (h.tierId ? m.id === h.tierId : m.name === h.tier));
    if (!meter || !validCents(meter.seedCents)) continue;
    if (byTier.has(meter.id)) continue; // newest first: one moment per tier
    byTier.add(meter.id);
    moments.push({ tierId: meter.id, tierName: meter.name, wonCents: h.amountCents, seedCents: meter.seedCents, until: nowMs + durationMs });
  }
  return { seen: next, moments };
}

/** Merge new moments in (newer replaces older on the same tier) and drop expired ones. */
export function mergeMoments(current: ReseedMoment[], incoming: ReseedMoment[], nowMs: number): ReseedMoment[] {
  const map = new Map<string, ReseedMoment>();
  for (const m of current) if (m.until > nowMs) map.set(m.tierId, m);
  for (const m of incoming) if (m.until > nowMs) map.set(m.tierId, m);
  return [...map.values()];
}

export function activeMoment(moments: ReseedMoment[], tierId: string, nowMs: number): ReseedMoment | null {
  return moments.find((m) => m.tierId === tierId && m.until > nowMs) ?? null;
}

/** While a moment is live the meter holds at its real seed; afterwards it shows the live pot. */
export function displayCents(liveCents: number, moment: ReseedMoment | null): number {
  return moment ? moment.seedCents : liveCents;
}

export function reseedLabel(m: Pick<ReseedMoment, "wonCents" | "seedCents">): string {
  return `Won ${formatCents(m.wonCents)} · reset to ${formatCents(m.seedCents)}`;
}

/** Milliseconds until the next moment ends (for a single clearing timer), or null. */
export function nextExpiry(moments: ReseedMoment[], nowMs: number): number | null {
  const live = moments.filter((m) => m.until > nowMs);
  if (!live.length) return null;
  return Math.max(0, Math.min(...live.map((m) => m.until)) - nowMs);
}
