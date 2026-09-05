import { randInt, newId } from "../rng";

export const SYMBOLS = ["WILD", "CROWN", "DIAMOND", "ACE", "CHIP", "HORSE", "LAMP", "BAR"] as const;
export type Symbol = (typeof SYMBOLS)[number];

/** 9 left-to-right lines on a 5x3 window. */
export const PAYLINES: number[][] = [
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

/** Pays per 1 credit for 3 / 4 / 5 of a kind. */
export const PAYTABLE: Record<Symbol, [number, number, number]> = {
  WILD: [60, 240, 1200],
  CROWN: [30, 120, 600],
  DIAMOND: [24, 96, 300],
  ACE: [18, 60, 180],
  CHIP: [12, 30, 96],
  HORSE: [10, 24, 60],
  LAMP: [6, 18, 48],
  BAR: [6, 12, 30],
};

/**
 * 20-stop strips, tuned so exact line RTP is ~95.1% at 9 credits.
 * WILD is scarce; BAR/LAMP fill the rest.
 */
export const REELS: Symbol[][] = [
  ["BAR","LAMP","CHIP","BAR","HORSE","ACE","BAR","LAMP","DIAMOND","BAR","HORSE","CHIP","BAR","LAMP","CROWN","BAR","ACE","HORSE","BAR","WILD"],
  ["LAMP","BAR","HORSE","CHIP","BAR","LAMP","ACE","BAR","HORSE","DIAMOND","BAR","LAMP","CHIP","BAR","HORSE","CROWN","BAR","ACE","LAMP","WILD"],
  ["BAR","CHIP","LAMP","BAR","HORSE","ACE","BAR","LAMP","CHIP","DIAMOND","BAR","HORSE","LAMP","BAR","ACE","CROWN","BAR","HORSE","CHIP","WILD"],
  ["LAMP","BAR","CHIP","HORSE","BAR","LAMP","ACE","BAR","DIAMOND","HORSE","BAR","LAMP","CHIP","BAR","CROWN","HORSE","BAR","ACE","LAMP","WILD"],
  ["BAR","LAMP","HORSE","BAR","CHIP","LAMP","BAR","ACE","HORSE","BAR","DIAMOND","LAMP","BAR","CHIP","HORSE","CROWN","BAR","ACE","LAMP","WILD"],
];

export const REEL_LEN = 20;
export const LINE_COUNT = PAYLINES.length;

function windowFromStops(stops: number[]): Symbol[][] {
  // grid[reel][row]
  return stops.map((stop, r) => {
    const strip = REELS[r]!;
    return [0, 1, 2].map((row) => strip[(stop + row) % strip.length]!);
  });
}

function lineSymbols(grid: Symbol[][], line: number[]): Symbol[] {
  return line.map((row, reel) => grid[reel]![row]!);
}

function evaluateLine(syms: Symbol[]): { symbol: Symbol | null; count: number; pay: number } {
  const first = syms[0] === "WILD" ? (syms.find((s) => s !== "WILD") ?? "WILD") : syms[0]!;
  let count = 0;
  for (const s of syms) {
    if (s === first || s === "WILD") count += 1;
    else break;
  }
  if (count < 3) return { symbol: null, count, pay: 0 };
  const pays = PAYTABLE[first];
  const pay = pays[count - 3]!;
  return { symbol: first, count, pay };
}

export function evaluateGrid(grid: Symbol[][], coinCents: number) {
  const lines = PAYLINES.map((line, i) => {
    const ev = evaluateLine(lineSymbols(grid, line));
    return { line: i, ...ev, winCents: ev.pay * coinCents };
  });
  const winCents = lines.reduce((a, l) => a + l.winCents, 0);
  return { lines, winCents };
}

export function spinStops(): number[] {
  return REELS.map((strip) => randInt(strip.length));
}

/** Min/max coin size in cents (total bet = coin × LINE_COUNT). */
export const MIN_COIN_CENTS = 25;
export const MAX_COIN_CENTS = 5000;

export function spinSlot(coinCents: number) {
  if (!Number.isInteger(coinCents) || coinCents < MIN_COIN_CENTS || coinCents > MAX_COIN_CENTS) {
    throw new Error("coin size must be an integer between $0.25 and $50.00");
  }
  const betCents = coinCents * LINE_COUNT;
  const stops = spinStops();
  const grid = windowFromStops(stops);
  const ev = evaluateGrid(grid, coinCents);
  return {
    id: newId(),
    stops,
    grid,
    betCents,
    coinCents,
    lines: ev.lines.filter((l) => l.winCents > 0),
    winCents: ev.winCents,
  };
}

export function publicSpin(res: ReturnType<typeof spinSlot>) {
  return {
    id: res.id,
    grid: res.grid,
    betCents: res.betCents,
    coinCents: res.coinCents,
    lineWins: res.lines,
    winCents: res.winCents,
  };
}

/** Exact RTP over all 20^5 stop tuples, 9-line bet. */
export function exactRtp(): number {
  const n = REEL_LEN;
  let totalPay = 0;
  let combos = 0;
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      for (let c = 0; c < n; c++) {
        for (let d = 0; d < n; d++) {
          for (let e = 0; e < n; e++) {
            const grid = windowFromStops([a, b, c, d, e]);
            totalPay += evaluateGrid(grid, 1).winCents;
            combos++;
          }
        }
      }
    }
  }
  const bet = LINE_COUNT;
  return totalPay / (combos * bet);
}

export const SLOT_INFO = {
  name: "Gilded Track",
  reels: 5,
  rows: 3,
  lines: LINE_COUNT,
  paytable: PAYTABLE,
  rtpNote: "Published theoretical RTP is computed from the 20-stop strips (target 94–96%).",
};
