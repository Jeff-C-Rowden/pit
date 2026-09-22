import { randInt, newId } from "../rng";

/**
 * Canopy Spire — jungle-themed 5-reel progressive video slot (separate from Gilded Track).
 * Route remains /vault; progressive family/tier ids stay vault-* for meter continuity.
 *
 * Progressive (Jackpot Desk v1):
 * - Four shared meters: Mini / Minor / Major / Grand.
 * - Total contribution 300 bps (3%) of coin-in, split across tiers.
 * - Contribution is taken from the same bet debit (not an extra charge).
 * - All sandbox bets qualify.
 * - Hits are meter/mystery driven (no symbol required for v1).
 * - Main-game line RTP (excl. progressive) targets ~93–95%.
 */

export const VS_SYMBOLS = [
  "WILD",
  "MONKEY",
  "PARROT",
  "JAGUAR",
  "TOUCAN",
  "BANANA",
  "COCONUT",
  "VINE",
] as const;
export type VsSymbol = (typeof VS_SYMBOLS)[number];

export const VS_PAYLINES: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
];

export const VS_PAYTABLE: Record<VsSymbol, [number, number, number]> = {
  WILD: [50, 200, 800],
  MONKEY: [40, 160, 500],
  PARROT: [28, 100, 400],
  JAGUAR: [20, 80, 240],
  TOUCAN: [14, 48, 140],
  BANANA: [10, 28, 80],
  COCONUT: [8, 20, 48],
  VINE: [5, 12, 28],
};

export const VS_REELS: VsSymbol[][] = [
  ["VINE","COCONUT","TOUCAN","VINE","BANANA","PARROT","VINE","COCONUT","JAGUAR","VINE","BANANA","TOUCAN","VINE","COCONUT","PARROT","VINE","TOUCAN","BANANA","VINE","WILD"],
  ["COCONUT","VINE","BANANA","TOUCAN","VINE","COCONUT","PARROT","VINE","BANANA","JAGUAR","VINE","COCONUT","TOUCAN","VINE","BANANA","PARROT","VINE","TOUCAN","COCONUT","MONKEY"],
  ["VINE","TOUCAN","COCONUT","VINE","BANANA","PARROT","VINE","COCONUT","TOUCAN","JAGUAR","VINE","BANANA","COCONUT","VINE","PARROT","TOUCAN","VINE","BANANA","COCONUT","WILD"],
  ["COCONUT","VINE","TOUCAN","BANANA","VINE","COCONUT","PARROT","VINE","JAGUAR","BANANA","VINE","COCONUT","TOUCAN","VINE","PARROT","BANANA","VINE","TOUCAN","COCONUT","MONKEY"],
  ["VINE","COCONUT","BANANA","VINE","TOUCAN","COCONUT","VINE","PARROT","BANANA","VINE","JAGUAR","COCONUT","VINE","TOUCAN","BANANA","PARROT","VINE","TOUCAN","COCONUT","WILD"],
];

export const VS_REEL_LEN = 20;
export const VS_LINE_COUNT = VS_PAYLINES.length;
export const VS_MIN_COIN_CENTS = 25;
export const VS_MAX_COIN_CENTS = 5000;

/** Family id prefix for lobby / docs. */
export const VS_PROGRESSIVE_FAMILY = "vault-spire";

export type TierId = "vault-mini" | "vault-minor" | "vault-major" | "vault-grand";

export type TierDef = {
  id: TierId;
  name: "Mini" | "Minor" | "Major" | "Grand";
  seedCents: number;
  /** Must-hit-by ceiling; null = no MHB (Grand uses mystery only). */
  ceilingCents: number | null;
  contributionBps: number;
  /** Grand mystery: roughly 1 / mysteryOddsPerSpin chance on each qualifying spin. */
  mysteryOddsPerSpin: number | null;
};

export const VS_TIERS: TierDef[] = [
  { id: "vault-mini", name: "Mini", seedCents: 1_000, ceilingCents: 3_000, contributionBps: 100, mysteryOddsPerSpin: null },
  { id: "vault-minor", name: "Minor", seedCents: 5_000, ceilingCents: 15_000, contributionBps: 70, mysteryOddsPerSpin: null },
  { id: "vault-major", name: "Major", seedCents: 25_000, ceilingCents: 100_000, contributionBps: 50, mysteryOddsPerSpin: null },
  { id: "vault-grand", name: "Grand", seedCents: 250_000, ceilingCents: null, contributionBps: 80, mysteryOddsPerSpin: 35_000 },
];

export const VS_TOTAL_CONTRIBUTION_BPS = VS_TIERS.reduce((a, t) => a + t.contributionBps, 0); // 300

function windowFromStops(stops: number[]): VsSymbol[][] {
  return stops.map((stop, r) => {
    const strip = VS_REELS[r]!;
    return [0, 1, 2].map((row) => strip[(stop + row) % strip.length]!);
  });
}

function lineSymbols(grid: VsSymbol[][], line: number[]): VsSymbol[] {
  return line.map((row, reel) => grid[reel]![row]!);
}

function evaluateLine(syms: VsSymbol[]): { symbol: VsSymbol | null; count: number; pay: number } {
  const first = syms[0] === "WILD" ? (syms.find((s) => s !== "WILD") ?? "WILD") : syms[0]!;
  let count = 0;
  for (const s of syms) {
    if (s === first || s === "WILD") count += 1;
    else break;
  }
  if (count < 3) return { symbol: null, count, pay: 0 };
  const pays = VS_PAYTABLE[first];
  const pay = pays[count - 3]!;
  return { symbol: first, count, pay };
}

export function evaluateVsGrid(grid: VsSymbol[][], coinCents: number) {
  const lines = VS_PAYLINES.map((line, i) => {
    const ev = evaluateLine(lineSymbols(grid, line));
    return { line: i, ...ev, winCents: ev.pay * coinCents };
  });
  const lineWinCents = lines.reduce((a, l) => a + l.winCents, 0);
  return { lines, lineWinCents };
}

export function spinVsStops(): number[] {
  return VS_REELS.map((strip) => randInt(strip.length));
}

/** Split coin-in across tiers by bps; remainder cents go to Grand. */
export function splitContribution(betCents: number): Record<TierId, number> {
  const out = {
    "vault-mini": 0,
    "vault-minor": 0,
    "vault-major": 0,
    "vault-grand": 0,
  } as Record<TierId, number>;
  let allocated = 0;
  for (const t of VS_TIERS) {
    if (t.id === "vault-grand") continue;
    const c = Math.floor((betCents * t.contributionBps) / 10_000);
    out[t.id] = c;
    allocated += c;
  }
  const total = Math.floor((betCents * VS_TOTAL_CONTRIBUTION_BPS) / 10_000);
  out["vault-grand"] = Math.max(0, total - allocated);
  return out;
}

export function contributionCents(betCents: number): number {
  return Math.floor((betCents * VS_TOTAL_CONTRIBUTION_BPS) / 10_000);
}

export function spinVaultSpire(coinCents: number) {
  if (!Number.isInteger(coinCents) || coinCents < VS_MIN_COIN_CENTS || coinCents > VS_MAX_COIN_CENTS) {
    throw new Error("coin size must be an integer between $0.25 and $50.00");
  }
  const betCents = coinCents * VS_LINE_COUNT;
  const contribByTier = splitContribution(betCents);
  const contrib = contributionCents(betCents);
  const stops = spinVsStops();
  const grid = windowFromStops(stops);
  const ev = evaluateVsGrid(grid, coinCents);
  return {
    id: newId(),
    stops,
    grid,
    betCents,
    coinCents,
    contributionCents: contrib,
    contributionByTier: contribByTier,
    lines: ev.lines.filter((l) => l.winCents > 0),
    lineWinCents: ev.lineWinCents,
  };
}

export function publicVsSpin(
  res: ReturnType<typeof spinVaultSpire> & {
    progressiveHits?: { tierId: TierId; name: string; awardCents: number }[];
    progressiveAwardCents?: number;
    metersAfter?: unknown;
    winCents?: number;
  },
) {
  return {
    id: res.id,
    grid: res.grid,
    betCents: res.betCents,
    coinCents: res.coinCents,
    contributionCents: res.contributionCents,
    contributionByTier: res.contributionByTier,
    lineWins: res.lines,
    lineWinCents: res.lineWinCents,
    progressiveHits: res.progressiveHits ?? [],
    progressiveAwardCents: res.progressiveAwardCents ?? 0,
    metersAfter: res.metersAfter ?? null,
    winCents: res.winCents ?? res.lineWinCents + (res.progressiveAwardCents ?? 0),
  };
}

/** Exact line RTP over all 20^5 stop tuples (excludes progressive awards). */
export function exactVsLineRtp(): number {
  const n = VS_REEL_LEN;
  let totalPay = 0;
  let combos = 0;
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      for (let c = 0; c < n; c++) {
        for (let d = 0; d < n; d++) {
          for (let e = 0; e < n; e++) {
            const grid = windowFromStops([a, b, c, d, e]);
            totalPay += evaluateVsGrid(grid, 1).lineWinCents;
            combos++;
          }
        }
      }
    }
  }
  return totalPay / (combos * VS_LINE_COUNT);
}

export const VAULT_SPIRE_INFO = {
  name: "Canopy Spire",
  reels: 5,
  rows: 3,
  lines: VS_LINE_COUNT,
  paytable: VS_PAYTABLE,
  progressiveFamily: VS_PROGRESSIVE_FAMILY,
  tiers: VS_TIERS.map((t) => ({
    id: t.id,
    name: t.name,
    seedCents: t.seedCents,
    ceilingCents: t.ceilingCents,
    contributionBps: t.contributionBps,
    mysteryOddsPerSpin: t.mysteryOddsPerSpin,
  })),
  totalContributionBps: VS_TOTAL_CONTRIBUTION_BPS,
  allBetsQualify: true,
  rtpNote:
    "Main-game line RTP (excluding progressive) targets ~93–95% from the 20-stop strips. " +
    "Each spin contributes 3.00% of coin-in (300 bps) across Mini/Minor/Major/Grand meters from the same bet debit. " +
    "All sandbox bets qualify. Mini/Minor/Major use hidden must-hit-by thresholds; Grand is a rare mystery (~1/35k spins). " +
    "Demo chips only — not a licensed casino jackpot.",
};
