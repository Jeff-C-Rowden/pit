/**
 * Published RTP / house-edge / volatility lines, frozen from server paytable math
 * (src/lib/games/rtpMath.ts, exactBuckshotRtp, table combinatorics) and locked in
 * tests/volatility.test.ts so the lobby copy cannot drift from the math.
 */
import { volBucket, winsAbout, VOL_TIP, type VolBucket } from "./games/volatility";

export type { VolBucket };
export { volBucket, winsAbout, VOL_TIP };

export type GameMath = {
  id: string;
  href: string;
  /** "RTP 95.53%" or "House edge 0.4%" or "No rake". */
  rtpLine: string;
  volatility: VolBucket | "by-bet";
  /** SD per $1 used for the game-level bucket; null when volatility is per bet. */
  sdPerUnit: number | null;
  /** Full honest line shown on lobby tiles and in-game info panels. */
  line: string;
  tip: string;
  /** Volatility filter buckets this game belongs in. */
  filterBuckets: VolBucket[];
};

const TIP = VOL_TIP;

function slotLine(rtp: string, vol: VolBucket, extra: string, win: string) {
  return extra ? `RTP ${rtp} · ${vol} volatility · ${extra} · ${win}` : `RTP ${rtp} · ${vol} volatility · ${win}`;
}

/** Frozen Sundown Trail figures from sundownTrailExact() (20^5 enumeration). */
export const SUNDOWN_MATH = {
  rtp: 0.955318,
  sdPerUnit: 1.76821,
  hitRate: 0.5145,
  winRate: 0.30560625,
} as const;

/** Frozen Antler Ridge figures: line from antlerRidgeLineExact; total/SD at a $1 coin. */
export const ANTLER_MATH = {
  lineRtp: 0.892161,
  totalRtpMin: 0.9483, // $50 coin
  totalRtpMax: 0.9504, // $0.25 coin
  sdAt25: 6.46689,
  sdAt100: 3.58015,
  sdAt500: 2.25462,
  winRate: 0.2570875,
} as const;

/** Frozen Buckshot Bars figures from exactBuckshotRtp. */
export const BUCKSHOT_MATH = {
  rtp1: 0.944444,
  rtp3: 0.946670,
  sd1: 9.81134,
  sd3: 9.99468,
  hitRate: 0.1908386752136752,
  winRate: 0.08800747863247864,
} as const;

/** Frozen Bounty Bars (Bonus to Cash) figures from exactBuckshotRtp(·, BB_BOUNTY_TABLE). */
export const BOUNTY_MATH = {
  rtp1: 0.903112,
  rtp3: 0.905337,
  sd1: 9.41947,
  sd3: 9.61030,
  hitRate: 0.1908386752136752,
  winRate: 0.08800747863247864,
} as const;

/**
 * Frozen Canary Creek Mine figures. RTP, feature chances and SD are exact (mineExactFull: closed
 * form + 30^5 enumeration + free-spin moment DP); winRate (net profit incl. features) is from the
 * seeded 10M-spin Monte Carlo in audit/mine.ts. Locked in tests/mine.test.ts.
 */
export const MINE_MATH = {
  rtp: 0.954245,
  baseRtp: 0.724509, // lines 70.33% + dynamite scatter pays 2.12%
  lineRtp: 0.703309,
  scatterRtp: 0.0212,
  freeSpinsRtp: 0.109736,
  pickRtp: 0.12,
  sdPerUnit: 3.11214,
  hitRate: 0.447034,
  winRate: 0.188634,
  freeSpinsChance: 0.00856,
  pickChance: 0.008,
  freeSpinsPerFeature: 8.847138,
  freeSpinFeatureX: 12.819661,
  pickExpectedX: 15,
} as const;

/** Feature frequencies shown on the lobby tile, game info panel and /rules. */
export const MINE_FEATURE_LINE = `Free spins about 1 in ${Math.round(1 / MINE_MATH.freeSpinsChance)} spins · Mine Cart pick about 1 in ${Math.round(1 / MINE_MATH.pickChance)} spins`;

/**
 * Frozen Thunderhoof Prairie figures. RTP, feature chances and SD are exact (prairieExactFull: closed-form
 * ways + two 30^5 enumerations + free-spin moment DP + Hold & Spin Markov chain); winRate (net profit incl.
 * features) is from the seeded 10M-spin Monte Carlo in audit/prairie.ts. Locked in tests/prairie.test.ts.
 */
export const PRAIRIE_MATH = {
  rtp: 0.9525,
  baseRtp: 0.585223, // ways 56.66% + storm scatter pays 1.87%
  waysRtp: 0.566573,
  scatterRtp: 0.01865,
  freeSpinsRtp: 0.166892,
  holdRtp: 0.200385,
  sdPerUnit: 6.81082,
  hitRate: 0.40238,
  winRate: 0.128017,
  freeSpinsChance: 0.00856,
  holdChance: 0.011524,
  freeSpinsPerFeature: 8.847138,
  freeSpinFeatureX: 19.49675,
  holdFeatureX: 17.38853,
  holdFullScreenChance: 0.001735,
} as const;

export const PRAIRIE_FEATURE_LINE = `Free spins about 1 in ${Math.round(1 / PRAIRIE_MATH.freeSpinsChance)} spins · Hold & Spin about 1 in ${Math.round(1 / PRAIRIE_MATH.holdChance)} spins`;

export const TABLE_MATH = {
  blackjack: { edge: 0.00405, sdPerUnit: 1.15 },
  paigow: { edge: 0.0285, sdPerUnit: 0.79 },
  rouletteEven: { edge: 2 / 38, sdPerUnit: 0.9993 },
  rouletteDozen: { edge: 2 / 38, sdPerUnit: 1.3926 },
  rouletteStraight: { edge: 2 / 38, sdPerUnit: 5.7632 },
} as const;

const GAMES: Record<string, GameMath> = {
  slot: {
    id: "slot",
    href: "/slot",
    rtpLine: "RTP 95.53%",
    volatility: "Low",
    sdPerUnit: SUNDOWN_MATH.sdPerUnit,
    line: slotLine("95.53%", "Low", "", winsAbout(SUNDOWN_MATH.winRate)),
    tip: TIP,
    filterBuckets: ["Low"],
  },
  vault: {
    id: "vault",
    href: "/vault",
    rtpLine: "RTP 94.8–95.0%",
    volatility: "Medium",
    sdPerUnit: ANTLER_MATH.sdAt100,
    line: "RTP 94.8–95.0% · Medium volatility · jackpots included · " + winsAbout(ANTLER_MATH.winRate),
    tip: TIP,
    filterBuckets: ["Medium"],
  },
  buckshot: {
    id: "buckshot",
    href: "/buckshot",
    rtpLine: "RTP 94.44–94.67%",
    volatility: "High",
    sdPerUnit: BUCKSHOT_MATH.sd3,
    line: slotLine("94.44–94.67%", "High", "", winsAbout(BUCKSHOT_MATH.winRate)),
    tip: TIP,
    filterBuckets: ["High"],
  },
  bounty: {
    id: "bounty",
    href: "/bounty",
    rtpLine: "RTP 90.31–90.53%",
    volatility: "High",
    sdPerUnit: BOUNTY_MATH.sd3,
    line: slotLine("90.31–90.53%", "High", "Bonus to Cash", winsAbout(BOUNTY_MATH.winRate)),
    tip: TIP,
    filterBuckets: ["High"],
  },
  mine: {
    id: "mine",
    href: "/mine",
    rtpLine: "RTP 95.42%",
    volatility: "Medium",
    sdPerUnit: MINE_MATH.sdPerUnit,
    line: slotLine("95.42%", "Medium", "features included", winsAbout(MINE_MATH.winRate)),
    tip: TIP,
    filterBuckets: ["Medium"],
  },
  prairie: {
    id: "prairie",
    href: "/prairie",
    rtpLine: "RTP 95.25%",
    volatility: "Medium",
    sdPerUnit: PRAIRIE_MATH.sdPerUnit,
    line: slotLine("95.25%", "Medium", "features included", winsAbout(PRAIRIE_MATH.winRate)),
    tip: TIP,
    filterBuckets: ["Medium"],
  },
  blackjack: {
    id: "blackjack",
    href: "/blackjack",
    rtpLine: "House edge 0.4%",
    volatility: "Low",
    sdPerUnit: TABLE_MATH.blackjack.sdPerUnit,
    line: "House edge 0.4% · Low volatility",
    tip: TIP,
    filterBuckets: ["Low"],
  },
  paigow: {
    id: "paigow",
    href: "/paigow",
    rtpLine: "House edge 2.9%",
    volatility: "Low",
    sdPerUnit: TABLE_MATH.paigow.sdPerUnit,
    line: "House edge 2.9% · Low volatility",
    tip: TIP,
    filterBuckets: ["Low"],
  },
  holdem: {
    id: "holdem",
    href: "/holdem",
    rtpLine: "No rake",
    volatility: "High",
    sdPerUnit: null,
    line: "No rake · High volatility · results depend on your play",
    tip: TIP,
    filterBuckets: ["High"],
  },
  roulette: {
    id: "roulette",
    href: "/roulette",
    rtpLine: "House edge 5.26%",
    volatility: "by-bet",
    sdPerUnit: null,
    line: "House edge 5.26% · volatility by bet (see rules)",
    tip: "Even-money and dozens are Low volatility; a straight-up number is Medium. Listed per bet on the rules and odds table. Not a prediction of the next spin.",
    filterBuckets: ["Low", "Medium"],
  },
  craps: {
    id: "craps",
    href: "/craps",
    rtpLine: "Pass edge 1.41%",
    volatility: "by-bet",
    sdPerUnit: null,
    line: "Pass edge 1.41% · volatility by bet (see rules)",
    tip: "Pass, come, place and the field are Low volatility; some proposition bets are Medium. Listed per bet on the rules page. Not a prediction of the next spin.",
    filterBuckets: ["Low", "Medium"],
  },
};

const BY_HREF = Object.fromEntries(Object.values(GAMES).map((g) => [g.href, g]));

export function gameMath(idOrHref: string): GameMath {
  if (GAMES[idOrHref]) return GAMES[idOrHref]!;
  if (BY_HREF[idOrHref]) return BY_HREF[idOrHref]!;
  throw new Error(`unknown game math id ${idOrHref}`);
}

export function allGameMath(): GameMath[] {
  return Object.values(GAMES);
}

export type VolFilter = "all" | VolBucket;

export function filterByVolatility<T extends { href: string }>(games: T[], vol: VolFilter): T[] {
  if (vol === "all") return games;
  return games.filter((g) => {
    const m = BY_HREF[g.href];
    return m ? m.filterBuckets.includes(vol) : true;
  });
}

/** SD of a one-roll bet that covers `hits` outcomes out of `pockets` and pays `pay`:1 (total pay+1). */
export function oneRollSd(hits: number, pockets: number, pay: number): number {
  const mean = (hits * (pay + 1)) / pockets;
  return Math.sqrt((hits * (pay + 1) * (pay + 1)) / pockets - mean * mean);
}

/** Roulette / craps per-bet rows for the rules and in-game odds tables. */
export type BetMath = { label: string; payout: string; edgePct: number; sdPerUnit: number; volatility: VolBucket };

export const ROULETTE_BET_MATH: BetMath[] = [
  { label: "Straight up", payout: "35:1", edgePct: 5.26, sdPerUnit: oneRollSd(1, 38, 35), volatility: volBucket(oneRollSd(1, 38, 35)) },
  { label: "Split", payout: "17:1", edgePct: 5.26, sdPerUnit: oneRollSd(2, 38, 17), volatility: volBucket(oneRollSd(2, 38, 17)) },
  { label: "Street", payout: "11:1", edgePct: 5.26, sdPerUnit: oneRollSd(3, 38, 11), volatility: volBucket(oneRollSd(3, 38, 11)) },
  { label: "Corner", payout: "8:1", edgePct: 5.26, sdPerUnit: oneRollSd(4, 38, 8), volatility: volBucket(oneRollSd(4, 38, 8)) },
  { label: "Six line", payout: "5:1", edgePct: 5.26, sdPerUnit: oneRollSd(6, 38, 5), volatility: volBucket(oneRollSd(6, 38, 5)) },
  { label: "Dozen / column", payout: "2:1", edgePct: 5.26, sdPerUnit: oneRollSd(12, 38, 2), volatility: volBucket(oneRollSd(12, 38, 2)) },
  { label: "Red / black, even / odd, 1-18 / 19-36", payout: "1:1", edgePct: 5.26, sdPerUnit: oneRollSd(18, 38, 1), volatility: volBucket(oneRollSd(18, 38, 1)) },
];

export const CRAPS_BET_MATH: BetMath[] = [
  { label: "Pass / come", payout: "1:1", edgePct: 1.41, sdPerUnit: 1.00, volatility: volBucket(1.00) },
  { label: "Don't pass / don't come", payout: "1:1", edgePct: 1.40, sdPerUnit: 1.00, volatility: volBucket(1.00) },
  { label: "Odds (pass or lay)", payout: "true odds", edgePct: 0, sdPerUnit: 1.20, volatility: volBucket(1.20) },
  { label: "Place 6 / 8", payout: "7:6", edgePct: 1.52, sdPerUnit: 1.08, volatility: volBucket(1.08) },
  { label: "Place 5 / 9", payout: "7:5", edgePct: 4.00, sdPerUnit: 1.20, volatility: volBucket(1.20) },
  { label: "Place 4 / 10", payout: "9:5", edgePct: 6.67, sdPerUnit: 1.37, volatility: volBucket(1.37) },
  { label: "Field (3:1 on 12)", payout: "1:1 / 2:1 / 3:1", edgePct: 2.78, sdPerUnit: 1.14, volatility: volBucket(1.14) },
  { label: "Any 7", payout: "4:1", edgePct: 16.67, sdPerUnit: 1.86, volatility: volBucket(1.86) },
  { label: "Any craps / yo", payout: "7:1 / 15:1", edgePct: 11.11, sdPerUnit: 3.66, volatility: volBucket(3.66) },
  { label: "Hard 6 / 8", payout: "9:1", edgePct: 9.09, sdPerUnit: 2.87, volatility: volBucket(2.87) },
  { label: "Hard 4 / 10", payout: "7:1", edgePct: 11.11, sdPerUnit: 5.50, volatility: volBucket(5.50) },
];

