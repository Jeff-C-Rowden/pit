/**
 * Exact theoretical return-to-player math for the slots, computed from the same strips,
 * paytables and progressive rules the server uses. No sampling: every stop tuple is
 * enumerated and the progressive is solved in closed form (renewal-reward).
 */
import { REELS, evaluateGrid, LINE_COUNT } from "./slot";
import { VS_REELS, VS_TIERS, VS_LINE_COUNT, evaluateVsGrid, tierContributionLaw, type TierDef } from "./slotProgressive";

export type SlotExact = { rtp: number; hitRate: number; sdPerSpin: number };

function enumerate5(reels: readonly (readonly string[])[], payCredits: (grid: string[][]) => number, lines: number): SlotExact {
  const windows = reels.map((strip) => strip.map((_, stop) => [0, 1, 2].map((row) => strip[(stop + row) % strip.length]!)));
  const len = reels.map((r) => r.length);
  let sum = 0, sum2 = 0, hits = 0, combos = 0;
  const g: string[][] = [[], [], [], [], []];
  for (let a = 0; a < len[0]!; a++) { g[0] = windows[0]![a]!;
    for (let b = 0; b < len[1]!; b++) { g[1] = windows[1]![b]!;
      for (let c = 0; c < len[2]!; c++) { g[2] = windows[2]![c]!;
        for (let d = 0; d < len[3]!; d++) { g[3] = windows[3]![d]!;
          for (let e = 0; e < len[4]!; e++) { g[4] = windows[4]![e]!;
            const p = payCredits(g);
            sum += p; sum2 += p * p; combos++; if (p > 0) hits++;
          } } } } }
  const mean = sum / combos / lines;
  return { rtp: mean, hitRate: hits / combos, sdPerSpin: Math.sqrt(sum2 / combos / (lines * lines) - mean * mean) };
}

/** Gilded Track: exact RTP over all 20^5 stop tuples, 9-line bet. */
export function gildedTrackExact(): SlotExact {
  return enumerate5(REELS, (g) => evaluateGrid(g as never, 1).winCents, LINE_COUNT);
}

/** Canopy Spire base game (line pays only, excludes progressive awards). */
export function canopyLineExact(): SlotExact {
  return enumerate5(VS_REELS, (g) => evaluateVsGrid(g as never, 1).lineWinCents, VS_LINE_COUNT);
}

export type TierReturn = { tier: string; contribPct: number; returnPct: number; seedFundingPct: number; spinsPerHit: number };

/**
 * Long-run return of one progressive tier per unit coin-in for a player always betting `betCents`.
 * Each spin adds k = base or base+1 cents (prob q), exactly as splitContributionUnbiased does.
 * Must-hit-by: meter starts at seed S, hidden trigger T ~ U{S..C}; hit on the first spin with
 * S + (sum of k) >= T (at least one spin); by Wald, E[award] = S + E[k] E[n].
 * m(x) = expected spins to add >= x cents: m(x) = 1 + (1-q) m(x-base) + q m(x-base-1), m(<=0) = 0.
 * Grand mystery: hit chance p = bet / G per spin: return = (E[k] + S p) / bet.
 * Return = E[award] / (E[n] bet); seed funding = S / (E[n] bet).
 */
export function tierReturn(t: TierDef, betCents: number): TierReturn {
  const { base, pPlusOne: q } = tierContributionLaw(betCents, t);
  const eK = base + q;
  if (t.ceilingCents != null) {
    const S = t.seedCents, X = t.ceilingCents - S;
    const m = new Float64Array(X + 1);
    const at = (x: number) => (x <= 0 ? 0 : m[x]!);
    for (let x = 1; x <= X; x++) {
      m[x] = base === 0 ? 1 / q + at(x - 1) : 1 + (1 - q) * at(x - base) + q * at(x - base - 1);
    }
    let eN = 0;
    for (let x = 0; x <= X; x++) eN += (x === 0 ? 1 : m[x]!) / (X + 1);
    const eA = S + eK * eN;
    return { tier: t.name, contribPct: eK / betCents, returnPct: eA / (eN * betCents), seedFundingPct: S / (eN * betCents), spinsPerHit: eN };
  }
  const p = t.mysteryCoinInPerHitCents != null ? Math.min(1, betCents / t.mysteryCoinInPerHitCents) : 1 / t.mysteryOddsPerSpin!;
  return { tier: t.name, contribPct: eK / betCents, returnPct: (eK + t.seedCents * p) / betCents, seedFundingPct: (t.seedCents * p) / betCents, spinsPerHit: 1 / p };
}

export function canopyProgressiveExact(coinCents: number) {
  const bet = coinCents * VS_LINE_COUNT;
  const tiers = VS_TIERS.map((t) => tierReturn(t, bet));
  return {
    coinCents, betCents: bet, tiers,
    progressiveReturn: tiers.reduce((a, t) => a + t.returnPct, 0),
    contribution: tiers.reduce((a, t) => a + t.contribPct, 0),
    seedFunding: tiers.reduce((a, t) => a + t.seedFundingPct, 0),
  };
}

/** Canopy Spire total RTP at a coin size: base line RTP + long-run progressive return. */
export function canopyTotalExact(coinCents: number, line = canopyLineExact().rtp) {
  const prog = canopyProgressiveExact(coinCents);
  return { ...prog, lineRtp: line, totalRtp: line + prog.progressiveReturn };
}
