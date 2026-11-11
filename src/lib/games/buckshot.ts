/**
 * Buckshot Bars: a classic 3-reel, 1-payline machine played with 1 to 3 coins.
 *
 * Honest by construction:
 * - Each reel is a fixed physical strip (symbol, blank, symbol, blank, ...). The server
 *   picks every stop uniformly at random; nothing is weighted or re-picked for "feel".
 * - The window the player sees is the real strip: the stop on the payline plus its true
 *   neighbours above and below. No near-miss staging is possible.
 * - The RTP published to players is computed exactly by enumerating every stop combination
 *   (see exactBuckshotRtp, checked in tests).
 */
import { randInt, newId } from "../rng";

export const BB_SYMBOLS = ["WILD", "SEVEN", "BAR3", "BAR2", "BAR1", "CHERRY", "BLANK"] as const;
export type BbSymbol = (typeof BB_SYMBOLS)[number];

const sym = (list: string) => list.split(",").flatMap((s) => [s as BbSymbol, "BLANK" as BbSymbol]);

/** Physical strips: each symbol is followed by a blank. 24 / 24 / 26 stops. */
export const BB_REELS: BbSymbol[][] = [
  sym("BAR1,BAR2,CHERRY,BAR1,BAR3,BAR2,SEVEN,BAR1,BAR2,BAR3,BAR1,WILD"),
  sym("BAR2,BAR1,BAR3,CHERRY,BAR1,BAR2,WILD,BAR1,BAR3,SEVEN,BAR2,BAR1"),
  sym("BAR1,BAR3,BAR2,BAR1,SEVEN,BAR1,BAR2,CHERRY,BAR1,BAR3,WILD,BAR2,BAR1"),
];

/** Pays per coin for three of a kind on the payline. */
export const BB_PAYS = { SEVEN: 80, BAR3: 40, BAR2: 20, BAR1: 10 } as const;
/** Any mix of BAR symbols. */
export const BB_ANY_BAR = 2;
/** Cherries anywhere on the line: 1, 2 or 3 of them. */
export const BB_CHERRY = [0, 1, 3, 10] as const;
/** Three wilds: total pay for 1, 2 or 3 coins (the 3-coin jump is the only non-linear pay). */
export const BB_TOP = [0, 800, 1600, 2500] as const;
export const BB_MAX_COINS = 3;
/** Coin values in cents (sandbox chips). */
export const BB_DENOMS = [25, 50, 100, 200, 500] as const;

const BARS = new Set<BbSymbol>(["BAR1", "BAR2", "BAR3"]);

/** A Buckshot paytable. Same reels and symbols; only the pays differ between machines. */
export type BbTable = {
  pays: { SEVEN: number; BAR3: number; BAR2: number; BAR1: number };
  anyBar: number;
  cherry: readonly [number, number, number, number];
  top: readonly [number, number, number, number];
};
export const BB_TABLE: BbTable = { pays: BB_PAYS, anyBar: BB_ANY_BAR, cherry: BB_CHERRY, top: BB_TOP };
/**
 * Bounty Bars (Bonus to Cash): the Buckshot reels on a leaner paytable, about 90% RTP,
 * a few points under the regular floor because bonus-funded winnings pay out as cash.
 */
export const BB_BOUNTY_TABLE: BbTable = { pays: { SEVEN: 75, BAR3: 35, BAR2: 20, BAR1: 9 }, anyBar: 2, cherry: [0, 1, 3, 10], top: [0, 800, 1600, 2500] };

export type BbLineResult = { pay: number; kind: string; wilds: number };

/**
 * Evaluate the payline for `coins` coins. Pays are in coins.
 * WILD (the horseshoe) substitutes for any symbol and doubles the pay once per wild used.
 * Only the single best pay counts.
 */
export function evaluateBuckshot(line: readonly BbSymbol[], coins: number, t: BbTable = BB_TABLE): BbLineResult {
  const wilds = line.filter((s) => s === "WILD").length;
  if (wilds === 3) return { pay: t.top[coins]!, kind: "THREE WILDS", wilds };
  const rest = line.filter((s) => s !== "WILD");
  const mult = 2 ** wilds;
  let best = 0;
  let kind = "";
  const consider = (p: number, k: string) => { if (p > best) { best = p; kind = k; } };
  if (!rest.includes("BLANK")) {
    const first = rest[0]!;
    if (rest.every((s) => s === first) && first in t.pays) consider(t.pays[first as keyof BbTable["pays"]] * mult, `THREE ${first}`);
    if (rest.every((s) => BARS.has(s))) consider(t.anyBar * mult, "ANY BARS");
  }
  const cherries = rest.filter((s) => s === "CHERRY").length;
  if (cherries > 0) {
    const eff = Math.min(3, cherries + wilds);
    consider(t.cherry[eff]! * mult, `${eff} CHERR${eff === 1 ? "Y" : "IES"}`);
  }
  return { pay: best * coins, kind: best ? kind : "", wilds: best ? wilds : 0 };
}

export function windowFor(stops: readonly number[]): BbSymbol[][] {
  return stops.map((stop, r) => {
    const strip = BB_REELS[r]!;
    const n = strip.length;
    return [strip[(stop - 1 + n) % n]!, strip[stop]!, strip[(stop + 1) % n]!];
  });
}

export function validateBuckshotBet(coins: unknown, denomCents: unknown): { coins: number; denomCents: number; betCents: number } {
  const c = Number(coins);
  const d = Number(denomCents);
  if (!Number.isInteger(c) || c < 1 || c > BB_MAX_COINS) throw new Error("coins must be 1, 2 or 3");
  if (!(BB_DENOMS as readonly number[]).includes(d)) throw new Error("coin value must be one of $0.25, $0.50, $1, $2 or $5");
  return { coins: c, denomCents: d, betCents: c * d };
}

export function spinBuckshot(coinsRaw: unknown, denomRaw: unknown, pick: (n: number) => number = randInt, t: BbTable = BB_TABLE) {
  const { coins, denomCents, betCents } = validateBuckshotBet(coinsRaw, denomRaw);
  const stops = BB_REELS.map((strip) => pick(strip.length));
  const window = windowFor(stops);
  const line = window.map((w) => w[1]!);
  const ev = evaluateBuckshot(line, coins, t);
  return { id: newId(), stops, window, line, coins, denomCents, betCents, payCoins: ev.pay, kind: ev.kind, winCents: ev.pay * denomCents };
}

export function publicBuckshotSpin(s: ReturnType<typeof spinBuckshot>) {
  return { id: s.id, window: s.window, line: s.line, coins: s.coins, denomCents: s.denomCents, betCents: s.betCents, payCoins: s.payCoins, kind: s.kind, winCents: s.winCents };
}

/** Exact RTP for a given coin count: total pay over every stop combination / (combos × coins). */
export function exactBuckshotRtp(coins: number, t: BbTable = BB_TABLE): { rtp: number; hitRate: number; winRate: number; sdPerUnit: number; combos: number; totalPay: number } {
  const [a, b, c] = BB_REELS as [BbSymbol[], BbSymbol[], BbSymbol[]];
  let totalPay = 0, sum2 = 0, hits = 0, wins = 0, combos = 0;
  for (const x of a) for (const y of b) for (const z of c) {
    const p = evaluateBuckshot([x, y, z], coins, t).pay;
    totalPay += p; sum2 += p * p; combos++; if (p > 0) hits++; if (p > coins) wins++;
  }
  const mean = totalPay / (combos * coins);
  return {
    rtp: mean,
    hitRate: hits / combos,
    winRate: wins / combos,
    sdPerUnit: Math.sqrt(sum2 / combos / (coins * coins) - mean * mean),
    combos,
    totalPay,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

/** Paytable rows for the PAY TABLE glass, in coins for 1 / 2 / 3 coins played. */
export function buckshotPaytable(t: BbTable = BB_TABLE) {
  const row = (label: string, perCoin: number) => ({ label, pays: [perCoin, perCoin * 2, perCoin * 3] });
  return [
    { label: "3 × WILD horseshoe", pays: [t.top[1], t.top[2], t.top[3]] },
    row("3 × 7", t.pays.SEVEN),
    row("3 × TRIPLE BAR", t.pays.BAR3),
    row("3 × DOUBLE BAR", t.pays.BAR2),
    row("3 × SINGLE BAR", t.pays.BAR1),
    row("3 × CHERRY", t.cherry[3]),
    row("ANY 3 BARS", t.anyBar),
    row("2 × CHERRY", t.cherry[2]),
    row("1 × CHERRY", t.cherry[1]),
  ];
}

export function buckshotInfo(t: BbTable = BB_TABLE, name = "Buckshot Bars") {
  const r1 = exactBuckshotRtp(1, t);
  const r3 = exactBuckshotRtp(3, t);
  return {
    name,
    reels: 3,
    lines: 1,
    maxCoins: BB_MAX_COINS,
    denoms: BB_DENOMS,
    paytable: buckshotPaytable(t),
    rtp: { oneOrTwoCoins: r1.rtp, threeCoins: r3.rtp },
    hitRate: r1.hitRate,
    rtpPublished: `Exact theoretical RTP ${pct(r1.rtp)} at 1–2 coins and ${pct(r3.rtp)} at 3 coins, enumerated over all ${r1.combos.toLocaleString("en-US")} stop combinations. A win on about 1 spin in ${(1 / r1.hitRate).toFixed(1)}.`,
    wildNote: "The horseshoe is wild: it stands in for any symbol and doubles the pay for each one used. Three horseshoes pay the top award.",
  };
}
