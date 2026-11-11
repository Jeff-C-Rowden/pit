/**
 * Jackpot Desk J3 — per-tier hit history for Antler Ridge.
 *
 * Builds the in-game "Hit history" strip from REAL progressive_hits rows only:
 * the last 10 hits per tier (Mini / Minor / Major / Grand), each with the
 * amount, how long ago, and where the meter stood at the hit against that
 * tier's must-hit-by ceiling. The award IS the meter at the hit, so the
 * "meter vs ceiling" figure is computed from the real amount and the real
 * configured ceiling — never a prediction. Malformed or unknown-tier records
 * are dropped, nothing is padded, and an empty tier reads "No hits yet".
 * Copy never uses due / hot / about-to-hit language (checked in tests).
 */

import { compactDollars } from "./mhbBar";

export const HIT_HISTORY_PER_TIER = 10;
export const HIT_HISTORY_EMPTY = "No hits yet";
import { SANDBOX_CHIP_LABEL } from "./sandboxLabel";
export const HIT_HISTORY_SANDBOX = SANDBOX_CHIP_LABEL;

export type HitRecordLike = {
  tierId?: string | null;
  amountCents: number;
  at: string;
  displayName?: string | null;
};

export type TierConfigLike = {
  id: string;
  name: string;
  seedCents: number;
  ceilingCents: number | null;
};

export type HitHistoryRow = {
  key: string;
  amountCents: number;
  amountLabel: string;
  at: string;
  ago: string;
  who: string;
  /** Meter at hit as a share of the ceiling (0..100), null for uncapped tiers. */
  ceilingPercent: number | null;
  /** e.g. "at 90% of $30 cap" or "Mystery · no cap". */
  vsCeiling: string;
};

export type TierHitHistory = {
  tierId: string;
  name: string;
  seedCents: number;
  ceilingCents: number | null;
  /** Short tier context line, e.g. "Seed $10 · hits by $30". */
  rangeLabel: string;
  rows: HitHistoryRow[];
  empty: boolean;
};

/** "just now", "12m ago", "5h ago", "3d ago" — relative to `nowMs`. */
export function timeAgo(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || !Number.isFinite(nowMs)) return "";
  const ms = nowMs - t;
  if (ms < 45_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Meter-at-hit as whole percent of the ceiling; null when the tier has no cap. */
export function ceilingPercent(amountCents: number, ceilingCents: number | null): number | null {
  if (ceilingCents == null || !Number.isFinite(ceilingCents) || ceilingCents <= 0) return null;
  if (!Number.isFinite(amountCents)) return null;
  // A hit can never exceed the cap by more than one spin's contribution; show 100 max.
  return Math.max(0, Math.min(100, Math.round((amountCents / ceilingCents) * 100)));
}

export function vsCeilingLabel(amountCents: number, ceilingCents: number | null): string {
  const pct = ceilingPercent(amountCents, ceilingCents);
  if (pct == null) return "Mystery · no cap";
  return `at ${pct}% of ${compactDollars(ceilingCents!)} cap`;
}

export function rangeLabel(tier: TierConfigLike): string {
  if (tier.ceilingCents == null) return `Seed ${compactDollars(tier.seedCents)} · mystery, no cap`;
  return `Seed ${compactDollars(tier.seedCents)} · hits by ${compactDollars(tier.ceilingCents)}`;
}

function validRecord(h: unknown): h is HitRecordLike {
  if (!h || typeof h !== "object") return false;
  const r = h as HitRecordLike;
  return (
    typeof r.tierId === "string" &&
    typeof r.amountCents === "number" &&
    Number.isFinite(r.amountCents) &&
    r.amountCents > 0 &&
    typeof r.at === "string" &&
    Number.isFinite(Date.parse(r.at))
  );
}

/**
 * Group real hits by tier (newest first, at most `perTier` each), in tier
 * order. Unknown tiers and malformed rows are dropped; nothing is invented.
 */
export function buildHitHistory(
  hits: unknown,
  tiers: readonly TierConfigLike[],
  nowMs: number,
  perTier = HIT_HISTORY_PER_TIER,
): TierHitHistory[] {
  const list = Array.isArray(hits) ? hits.filter(validRecord) : [];
  const cap = Math.max(0, Math.floor(perTier));
  return tiers.map((tier) => {
    const mine = list
      .filter((h) => h.tierId === tier.id)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, cap);
    const rows: HitHistoryRow[] = mine.map((h, i) => ({
      key: `${tier.id}-${h.at}-${i}`,
      amountCents: h.amountCents,
      amountLabel: compactDollars(h.amountCents),
      at: h.at,
      ago: timeAgo(h.at, nowMs),
      who: (h.displayName && h.displayName.trim()) || "Player",
      ceilingPercent: ceilingPercent(h.amountCents, tier.ceilingCents),
      vsCeiling: vsCeilingLabel(h.amountCents, tier.ceilingCents),
    }));
    return {
      tierId: tier.id,
      name: tier.name,
      seedCents: tier.seedCents,
      ceilingCents: tier.ceilingCents,
      rangeLabel: rangeLabel(tier),
      rows,
      empty: rows.length === 0,
    };
  });
}

/**
 * Tab summary: "No hits yet", "1 hit", "3 hits", or "Last 10" once the list is
 * full (older hits exist but are not shown, so a total would be misleading).
 */
export function tierSummary(t: TierHitHistory, perTier = HIT_HISTORY_PER_TIER): string {
  if (t.empty) return HIT_HISTORY_EMPTY;
  if (t.rows.length >= perTier) return `Last ${perTier}`;
  return `${t.rows.length} hit${t.rows.length === 1 ? "" : "s"}`;
}
