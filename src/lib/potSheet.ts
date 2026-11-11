/**
 * Jackpot Desk J2 — "How this pot works" sheet for each Antler Ridge tier.
 *
 * Pure data builder: every number comes from the real tier config
 * (VS_TIERS / VS coin limits) plus the live meter value the server sent.
 * The hidden must-hit trigger is never exposed. The only frequency figure is
 * a long-run AVERAGE derived from the config (coin-in between hits across all
 * players), always labeled "not the odds of the next spin". No due/hot wording.
 */
import {
  VS_LINE_COUNT,
  VS_MAX_COIN_CENTS,
  VS_MIN_COIN_CENTS,
  VS_TIERS,
  VS_TOTAL_CONTRIBUTION_BPS,
  type TierDef,
} from "@/lib/games/slotProgressive";
import { compactDollars } from "@/lib/mhbBar";

export const POT_SHEET_BANNED_WORDS = /\b(due|hot|about to hit|overdue|ready to pop|any second|lucky)\b/i;
export const POT_SHEET_SANDBOX = "Sandbox / test chips, no cash value";

export type PotMeterLike = {
  id: string;
  name: string;
  progressiveCents: number;
  /** Live values from the server win over config when present (they are synced from config). */
  seedCents?: number;
  ceilingCents?: number | null;
  contributionBps?: number;
};

export type PotRow = { label: string; value: string };

export type PotSheet = {
  tierId: string;
  title: string;
  kind: "must-hit" | "mystery";
  rows: PotRow[];
  /** Plain-language paragraphs, in display order. */
  notes: string[];
  /** Long-run average, or null when it cannot be computed from config. */
  average: { text: string; caveat: string } | null;
  sandbox: string;
};

/** "1.00%" style from basis points. */
export function bpsPct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/** Cents → "$1,000" (whole dollars rounded) for averages. */
function roundDollars(cents: number): string {
  return compactDollars(Math.round(cents / 100) * 100);
}

/**
 * Long-run average coin-in (all players, all qualifying bets) between hits, in cents.
 * Must-hit-by: the hidden trigger is uniform on whole cents in [seed, ceiling], so the
 * meter climbs (ceiling − seed) / 2 on average, fed at bps of coin-in.
 * Grand mystery: each spin hits with chance bet / mysteryCoinInPerHitCents, so the
 * average coin-in per hit is exactly mysteryCoinInPerHitCents.
 */
export function avgCoinInPerHitCents(t: Pick<TierDef, "seedCents" | "ceilingCents" | "contributionBps" | "mysteryCoinInPerHitCents" | "mysteryOddsPerSpin">): number | null {
  if (t.ceilingCents != null) {
    if (!(t.contributionBps > 0)) return null;
    return ((t.ceilingCents - t.seedCents) / 2) / (t.contributionBps / 10_000);
  }
  if (t.mysteryCoinInPerHitCents != null && t.mysteryCoinInPerHitCents > 0) return t.mysteryCoinInPerHitCents;
  return null;
}

export function qualifyingText(): string {
  const minBet = VS_MIN_COIN_CENTS * VS_LINE_COUNT;
  const maxBet = VS_MAX_COIN_CENTS * VS_LINE_COUNT;
  return `Every Antler Ridge spin qualifies: any coin from ${compactDollars(VS_MIN_COIN_CENTS)} to ${compactDollars(VS_MAX_COIN_CENTS)} on all ${VS_LINE_COUNT} lines (${compactDollars(minBet)}–${compactDollars(maxBet)} a spin). No side bet or minimum is needed.`;
}

export function buildPotSheet(meter: PotMeterLike, tiers: readonly TierDef[] = VS_TIERS): PotSheet | null {
  const def = tiers.find((t) => t.id === meter.id) ?? tiers.find((t) => t.name === meter.name);
  if (!def) return null;
  const seed = Number.isFinite(meter.seedCents) ? (meter.seedCents as number) : def.seedCents;
  const ceiling = meter.ceilingCents !== undefined ? meter.ceilingCents : def.ceilingCents;
  const bps = Number.isFinite(meter.contributionBps) ? (meter.contributionBps as number) : def.contributionBps;
  const cfg = { ...def, seedCents: seed, ceilingCents: ceiling ?? null, contributionBps: bps };
  const kind = cfg.ceilingCents != null ? "must-hit" : "mystery";

  const rows: PotRow[] = [
    { label: "Meter now", value: compactDollars(meter.progressiveCents) },
    { label: "Resets to (seed)", value: compactDollars(seed) },
    {
      label: "Must hit by",
      value: cfg.ceilingCents != null ? compactDollars(cfg.ceilingCents) : "No cap (mystery)",
    },
    { label: "Share of each bet", value: `${bpsPct(bps)} (all four pots: ${bpsPct(VS_TOTAL_CONTRIBUTION_BPS)})` },
  ];

  const notes: string[] = [
    `A small part of each qualifying bet feeds this pot: ${bpsPct(bps)} of the bet goes to the ${def.name}. It comes out of the bet you already placed, not an extra charge.`,
    qualifyingText(),
  ];
  if (kind === "must-hit") {
    notes.push(
      `After each hit the pot resets to ${compactDollars(seed)} and the server picks a hidden point between ${compactDollars(seed)} and ${compactDollars(cfg.ceilingCents!)}. The spin that takes the meter to that point wins it, so it always pays by ${compactDollars(cfg.ceilingCents!)}. The hidden point is never shown.`,
    );
  } else {
    const perDollar = cfg.mysteryCoinInPerHitCents;
    const refBet = 100 * VS_LINE_COUNT;
    notes.push(
      perDollar != null
        ? `The Grand has no cap. Each spin has a fixed mystery chance of winning it: your bet ÷ ${compactDollars(perDollar)} (1 in ${Math.round(perDollar / refBet).toLocaleString("en-US")} on a ${compactDollars(refBet)} spin), the same chance per dollar at every bet size. The meter amount does not change that chance. It resets to ${compactDollars(seed)} after a hit.`
        : `The Grand has no cap and pays at random; it resets to ${compactDollars(seed)} after a hit.`,
    );
  }

  const avg = avgCoinInPerHitCents(cfg);
  const average =
    avg != null
      ? {
          text: `On average this pot pays once per about ${roundDollars(avg)} of qualifying bets, all players combined.`,
          caveat: "Long-run average from the pot's settings. It is not the odds of the next spin.",
        }
      : null;

  return { tierId: def.id, title: `${def.name} — how this pot works`, kind, rows, notes, average, sandbox: POT_SHEET_SANDBOX };
}

/** All visible copy, for wording checks. */
export function potSheetText(s: PotSheet): string {
  return [s.title, ...s.rows.flatMap((r) => [r.label, r.value]), ...s.notes, s.average?.text ?? "", s.average?.caveat ?? "", s.sandbox].join(" ");
}
