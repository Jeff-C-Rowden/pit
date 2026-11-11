import { randInt, newId } from "../rng";

/**
 * Kettle of Clover: story slot #3. 5 reels x 3 rows, 10 left-to-right lines, coin x 10 per spin.
 *
 * Honest by construction:
 * - Every reel is a fixed 30-stop strip; the server picks every stop uniformly at random. The window is
 *   the stop plus its true neighbours.
 * - The Rainbow Bridge wheel is drawn on the server: every wedge is equally likely (one uniform pick per
 *   wheel), and the client animation is told which wedge to land on. Free spins come from the same strips.
 * - Everything a spin can pay (base, wheel, every free spin) is decided and credited in the same request.
 *   RTP is exact (cloverExactFull) and confirmed by a seeded Monte Carlo (audit/clover.ts) through playClover.
 *
 * Features
 * - KETTLE scatter (one per strip): 3 / 4 / 5 anywhere pay 2x / 5x / 25x the bet and award 8 / 10 / 15 free
 *   spins. Free spins: any clover WILD that lands on reels 2-4 EXPANDS to fill its whole reel before lines are
 *   paid. Kettles are counted as they land (before expanding); 3+ retrigger the same awards; cap 100.
 *   Rainbows do nothing during free spins.
 * - RAINBOW bridge (two per strip, reels 1, 3 and 5 only): one on each of reels 1, 3 and 5 (any row) spins the
 *   Rainbow Wheel: 12 equal wedges of credits (x bet), a FREE SPINS wedge (10 expanding-wild free spins) and an
 *   UPGRADE wedge that moves to the 12-wedge outer Pot-of-Gold wheel (bigger credits, one free-spins wedge).
 * - WILD (four-leaf clover, reels 2-4) substitutes for every pay symbol, not KETTLE or RAINBOW.
 */

export const CL_SYMBOLS = ["WILD", "KETTLE", "RAINBOW", "HAT", "HARP", "FIDDLE", "TOADSTOOL", "ACORN", "BLUEBELL"] as const;
export type ClSymbol = (typeof CL_SYMBOLS)[number];
export type ClPaySymbol = "HAT" | "HARP" | "FIDDLE" | "TOADSTOOL" | "ACORN" | "BLUEBELL";
export const CL_PAY_SYMBOLS: ClPaySymbol[] = ["HAT", "HARP", "FIDDLE", "TOADSTOOL", "ACORN", "BLUEBELL"];

export const CL_PAYLINES: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [1, 0, 1, 2, 1],
];
export const CL_LINES = CL_PAYLINES.length;
export const CL_BET_COINS = CL_LINES;

/** Line pays per coin for 3 / 4 / 5 of a kind. */
export const CL_PAYTABLE: Record<ClPaySymbol, [number, number, number]> = {
  HAT: [25, 100, 500],
  HARP: [15, 60, 250],
  FIDDLE: [10, 40, 150],
  TOADSTOOL: [7, 20, 75],
  ACORN: [4, 12, 50],
  BLUEBELL: [2, 8, 30],
};

const S = (s: string) => s.split(" ") as ClSymbol[];
export const CL_REELS: ClSymbol[][] = [
  S("KETTLE HAT TOADSTOOL BLUEBELL HAT ACORN ACORN TOADSTOOL RAINBOW BLUEBELL FIDDLE HARP BLUEBELL TOADSTOOL BLUEBELL ACORN HARP FIDDLE HARP BLUEBELL ACORN FIDDLE BLUEBELL RAINBOW BLUEBELL ACORN FIDDLE ACORN TOADSTOOL TOADSTOOL"),
  S("KETTLE TOADSTOOL WILD HARP ACORN TOADSTOOL ACORN FIDDLE ACORN FIDDLE HAT ACORN ACORN WILD HARP BLUEBELL TOADSTOOL FIDDLE WILD BLUEBELL TOADSTOOL BLUEBELL HAT BLUEBELL BLUEBELL TOADSTOOL HARP FIDDLE BLUEBELL BLUEBELL"),
  S("KETTLE HAT HARP BLUEBELL TOADSTOOL BLUEBELL ACORN FIDDLE RAINBOW WILD TOADSTOOL TOADSTOOL BLUEBELL HARP FIDDLE ACORN HAT ACORN BLUEBELL FIDDLE ACORN WILD TOADSTOOL RAINBOW TOADSTOOL ACORN HARP FIDDLE BLUEBELL BLUEBELL"),
  S("KETTLE FIDDLE TOADSTOOL HAT FIDDLE BLUEBELL ACORN ACORN HARP ACORN WILD HARP FIDDLE TOADSTOOL BLUEBELL TOADSTOOL BLUEBELL BLUEBELL TOADSTOOL HAT WILD BLUEBELL FIDDLE ACORN BLUEBELL WILD BLUEBELL ACORN TOADSTOOL HARP"),
  S("KETTLE HAT ACORN TOADSTOOL HARP BLUEBELL ACORN ACORN RAINBOW TOADSTOOL BLUEBELL TOADSTOOL ACORN ACORN FIDDLE BLUEBELL BLUEBELL FIDDLE TOADSTOOL ACORN FIDDLE TOADSTOOL BLUEBELL RAINBOW BLUEBELL HAT HARP FIDDLE BLUEBELL HARP"),
];
export const CL_REEL_LEN = 30;
export const CL_RAINBOW_REELS = [0, 2, 4] as const;

export const CL_SCATTER_PAY = [0, 0, 0, 2, 5, 25] as const;
export const CL_FS_AWARD = [0, 0, 0, 8, 10, 15] as const;
export const CL_FS_CAP = 100;
export const CL_WHEEL_FS = 10;

export type Wedge = { kind: "credit"; x: number } | { kind: "fs"; spins: number } | { kind: "upgrade" };
const c = (x: number): Wedge => ({ kind: "credit", x });
/** Inner Rainbow Wheel, clockwise from the top; every wedge equally likely. */
export const CL_INNER_WHEEL: Wedge[] = [c(5), c(10), c(6), c(15), c(8), { kind: "fs", spins: CL_WHEEL_FS }, c(12), c(5), c(20), { kind: "upgrade" }, c(8), c(10)];
/** Outer Pot-of-Gold wheel (reached by UPGRADE), clockwise from the top; every wedge equally likely. */
export const CL_OUTER_WHEEL: Wedge[] = [c(25), c(40), c(30), c(60), c(25), c(100), c(40), { kind: "fs", spins: 20 }, c(30), c(75), c(250), c(50)];

export const CL_MIN_COIN_CENTS = 25;
export const CL_MAX_COIN_CENTS = 5000;

export type Pick = (n: number) => number;

export function clWindow(stops: number[]): ClSymbol[][] {
  return stops.map((stop, r) => [0, 1, 2].map((row) => CL_REELS[r]![(stop + row) % CL_REEL_LEN]!));
}

/** Free-spin view: a WILD anywhere on reels 2-4 fills its whole reel. */
export function expandWilds(grid: ClSymbol[][]): ClSymbol[][] {
  return grid.map((col, r) => (r >= 1 && r <= 3 && col.includes("WILD") ? ["WILD", "WILD", "WILD"] : col));
}

export function evaluateClLine(cells: ClSymbol[]): { symbol: ClPaySymbol; count: number; pay: number } | null {
  const first = cells[0]!;
  if (!(CL_PAY_SYMBOLS as string[]).includes(first)) return null;
  let n = 1;
  while (n < 5 && (cells[n] === first || cells[n] === "WILD")) n++;
  if (n < 3) return null;
  const s = first as ClPaySymbol;
  return { symbol: s, count: n, pay: CL_PAYTABLE[s][n - 3] };
}

export type ClLineWin = { line: number; symbol: ClPaySymbol; count: number; pay: number; winCents: number };
export const kettles = (grid: ClSymbol[][]) => grid.reduce((a, col) => a + (col.includes("KETTLE") ? 1 : 0), 0);
export const rainbowHit = (grid: ClSymbol[][]) => CL_RAINBOW_REELS.every((r) => grid[r]!.includes("RAINBOW"));

export type ClGrid = { grid: ClSymbol[][]; shown: ClSymbol[][]; lineWins: ClLineWin[]; lineWinCents: number; scatters: number; scatterWinCents: number; freeSpinsAwarded: number; wheel: boolean };

export function evaluateClGrid(grid: ClSymbol[][], coinCents: number, free = false): ClGrid {
  const shown = free ? expandWilds(grid) : grid;
  const lineWins: ClLineWin[] = [];
  CL_PAYLINES.forEach((pat, line) => {
    const w = evaluateClLine(pat.map((row, r) => shown[r]![row]!));
    if (w) lineWins.push({ line, ...w, winCents: w.pay * coinCents });
  });
  const scatters = kettles(grid);
  return {
    grid, shown, lineWins, lineWinCents: lineWins.reduce((a, w) => a + w.winCents, 0), scatters,
    scatterWinCents: CL_SCATTER_PAY[scatters]! * coinCents * CL_BET_COINS,
    freeSpinsAwarded: CL_FS_AWARD[scatters]!, wheel: !free && rainbowHit(grid),
  };
}

export type ClFreeSpin = { n: number; grid: ClSymbol[][]; shown: ClSymbol[][]; lineWins: ClLineWin[]; scatters: number; winCents: number; retrigger: number; awardedTotal: number };
export type ClFreeSpins = { initial: number; source: "kettle" | "wheel"; spins: ClFreeSpin[]; totalWinCents: number; capped: boolean };

export function runClFreeSpins(coinCents: number, initial: number, source: "kettle" | "wheel", pick: Pick): ClFreeSpins {
  let awarded = Math.min(initial, CL_FS_CAP), remaining = awarded, total = 0, capped = false;
  const spins: ClFreeSpin[] = [];
  while (remaining > 0) {
    remaining--;
    const g = evaluateClGrid(clWindow(CL_REELS.map(() => pick(CL_REEL_LEN))), coinCents, true);
    const win = g.lineWinCents + g.scatterWinCents;
    let add = 0;
    if (g.freeSpinsAwarded > 0) {
      add = Math.min(g.freeSpinsAwarded, CL_FS_CAP - awarded);
      if (add < g.freeSpinsAwarded) capped = true;
      awarded += add; remaining += add;
    }
    total += win;
    spins.push({ n: spins.length + 1, grid: g.grid, shown: g.shown, lineWins: g.lineWins, scatters: g.scatters, winCents: win, retrigger: add, awardedTotal: awarded });
  }
  return { initial: Math.min(initial, CL_FS_CAP), source, spins, totalWinCents: total, capped };
}

export type ClWheel = { inner: number; outer: number | null; result: Wedge; creditX: number; creditWinCents: number; freeSpins: ClFreeSpins | null; totalWinCents: number };

export function spinWheel(coinCents: number, pick: Pick): ClWheel {
  const betCents = coinCents * CL_BET_COINS;
  const inner = pick(CL_INNER_WHEEL.length);
  let outer: number | null = null;
  let result = CL_INNER_WHEEL[inner]!;
  if (result.kind === "upgrade") { outer = pick(CL_OUTER_WHEEL.length); result = CL_OUTER_WHEEL[outer]!; }
  const creditX = result.kind === "credit" ? result.x : 0;
  const freeSpins = result.kind === "fs" ? runClFreeSpins(coinCents, result.spins, "wheel", pick) : null;
  const creditWinCents = creditX * betCents;
  return { inner, outer, result, creditX, creditWinCents, freeSpins, totalWinCents: creditWinCents + (freeSpins?.totalWinCents ?? 0) };
}

export type CloverSpin = {
  id: string; coinCents: number; betCents: number; base: ClGrid; baseWinCents: number;
  wheel: ClWheel | null; freeSpins: ClFreeSpins | null; winCents: number;
};

export function playClover(coinCents: number, pick: Pick = randInt): CloverSpin {
  if (!Number.isInteger(coinCents) || coinCents < CL_MIN_COIN_CENTS || coinCents > CL_MAX_COIN_CENTS) {
    throw new Error("coin size must be an integer between $0.25 and $50.00");
  }
  const base = evaluateClGrid(clWindow(CL_REELS.map(() => pick(CL_REEL_LEN))), coinCents);
  const wheel = base.wheel ? spinWheel(coinCents, pick) : null;
  const freeSpins = base.freeSpinsAwarded > 0 ? runClFreeSpins(coinCents, base.freeSpinsAwarded, "kettle", pick) : null;
  const baseWinCents = base.lineWinCents + base.scatterWinCents;
  return {
    id: newId(), coinCents, betCents: coinCents * CL_BET_COINS, base, baseWinCents, wheel, freeSpins,
    winCents: baseWinCents + (wheel?.totalWinCents ?? 0) + (freeSpins?.totalWinCents ?? 0),
  };
}

export function publicCloverSpin(s: CloverSpin) {
  return {
    id: s.id, coinCents: s.coinCents, betCents: s.betCents, grid: s.base.grid, lineWins: s.base.lineWins,
    lineWinCents: s.base.lineWinCents, scatters: s.base.scatters, scatterWinCents: s.base.scatterWinCents,
    baseWinCents: s.baseWinCents, wheel: s.wheel, freeSpins: s.freeSpins, winCents: s.winCents,
  };
}

// ---------------------------------------------------------------- exact math

const SYM_IDX = new Map(CL_SYMBOLS.map((s, i) => [s, i] as const));
const WILD_I = 0;

/** Closed-form line RTP per unit bet. Reels are independent, so each payline is a product of per-reel cell laws
 *  for the row it crosses. In free spins a reel on 2-4 with a wild anywhere in its window shows WILD on every row,
 *  which makes the law depend on the row (top/middle/bottom), so it is computed per (reel, row). */
export function lineRtpExact(free = false): number {
  const law = CL_REELS.map((strip, r) => [0, 1, 2].map((row) => {
    const p = new Map<ClSymbol, number>();
    for (let t = 0; t < CL_REEL_LEN; t++) {
      const w = [0, 1, 2].map((k) => strip[(t + k) % CL_REEL_LEN]!);
      const cell = free && r >= 1 && r <= 3 && w.includes("WILD") ? "WILD" : w[row]!;
      p.set(cell, (p.get(cell) ?? 0) + 1 / CL_REEL_LEN);
    }
    return p;
  }));
  let e = 0;
  for (const pat of CL_PAYLINES) {
    const L = (r: number) => law[r]![pat[r]!]!;
    for (const s of CL_PAY_SYMBOLS) {
      const m = (r: number) => (L(r).get(s) ?? 0) + (r > 0 ? L(r).get("WILD") ?? 0 : 0);
      const p3 = (L(0).get(s) ?? 0) * m(1) * m(2);
      const p4 = p3 * m(3), p5 = p4 * m(4);
      e += (p3 - p4) * CL_PAYTABLE[s][0] + (p4 - p5) * CL_PAYTABLE[s][1] + p5 * CL_PAYTABLE[s][2];
    }
  }
  return e / CL_BET_COINS;
}

export type ClEnum = { combos: number; rtp: number; hitRate: number; bins: { p: number; eB: number; eB2: number }[][] };

/** Full 30^5 enumeration. B = lines + kettle pays per unit bet; bins[k][wheel 0|1]. */
export function clEnumerate(free = false): ClEnum {
  const L = CL_REEL_LEN;
  const win = CL_REELS.map((strip, r) => Array.from({ length: L }, (_, t) => {
    const w = [0, 1, 2].map((k) => strip[(t + k) % L]!);
    const shown = free && r >= 1 && r <= 3 && w.includes("WILD") ? ["WILD", "WILD", "WILD"] as ClSymbol[] : w;
    return { cells: shown.map((s) => SYM_IDX.get(s)!), k: w.includes("KETTLE") ? 1 : 0, rb: w.includes("RAINBOW") ? 1 : 0 };
  }));
  const payIdx: number[][] = CL_SYMBOLS.map((s) => ((CL_PAY_SYMBOLS as string[]).includes(s) ? CL_PAYTABLE[s as ClPaySymbol] : [0, 0, 0]));
  const isPay = CL_SYMBOLS.map((s) => (CL_PAY_SYMBOLS as string[]).includes(s));
  const lines = CL_PAYLINES;
  const bins = Array.from({ length: 6 }, () => [0, 1].map(() => ({ p: 0, eB: 0, eB2: 0 })));
  let sum = 0, hits = 0, combos = 0;
  for (let a = 0; a < L; a++) { const A = win[0]![a]!;
    for (let b = 0; b < L; b++) { const B = win[1]![b]!;
      for (let cc = 0; cc < L; cc++) { const C = win[2]![cc]!;
        for (let d = 0; d < L; d++) { const D = win[3]![d]!;
          for (let e = 0; e < L; e++) { const E = win[4]![e]!;
            let pay = 0;
            for (let li = 0; li < lines.length; li++) {
              const pat = lines[li]!;
              const s0 = A.cells[pat[0]!]!;
              if (!isPay[s0]) continue;
              const s1 = B.cells[pat[1]!]!; if (s1 !== s0 && s1 !== WILD_I) continue;
              const s2 = C.cells[pat[2]!]!; if (s2 !== s0 && s2 !== WILD_I) continue;
              const s3 = D.cells[pat[3]!]!; if (s3 !== s0 && s3 !== WILD_I) { pay += payIdx[s0]![0]!; continue; }
              const s4 = E.cells[pat[4]!]!; if (s4 !== s0 && s4 !== WILD_I) { pay += payIdx[s0]![1]!; continue; }
              pay += payIdx[s0]![2]!;
            }
            const k = A.k + B.k + C.k + D.k + E.k;
            const wheel = !free && A.rb && C.rb && E.rb ? 1 : 0;
            const unit = pay / CL_BET_COINS + CL_SCATTER_PAY[k]!;
            const bn = bins[k]![wheel]!;
            bn.p++; bn.eB += unit; bn.eB2 += unit * unit;
            sum += unit; combos++;
            if (unit > 0 || k >= 3 || wheel) hits++;
          }
        } } } }
  for (const row of bins) for (const bn of row) { bn.p /= combos; bn.eB /= combos; bn.eB2 /= combos; }
  return { combos, rtp: sum / combos, hitRate: hits / combos, bins };
}

/** Exact free-spin moments (per unit bet) by DP over (awarded, remaining). */
export function clFreeSpinMoments(initial: number, fs: ClEnum): { m1: number; m2: number; eN: number } {
  const byK = fs.bins.map((row) => row.reduce((a, b) => ({ p: a.p + b.p, eB: a.eB + b.eB, eB2: a.eB2 + b.eB2 }), { p: 0, eB: 0, eB2: 0 }));
  const memo = new Map<number, [number, number, number]>();
  const f = (awarded: number, remaining: number): [number, number, number] => {
    if (remaining <= 0) return [0, 0, 0];
    const key = awarded * 1000 + remaining;
    const hit = memo.get(key); if (hit) return hit;
    let m1 = 0, m2 = 0, n = 1;
    for (let k = 0; k <= 5; k++) {
      const add = Math.min(CL_FS_AWARD[k]!, CL_FS_CAP - awarded);
      const [n1, n2, nn] = f(awarded + add, remaining - 1 + add);
      const pk = byK[k]!.p, eY = byK[k]!.eB, eY2 = byK[k]!.eB2;
      m1 += eY + pk * n1; m2 += eY2 + 2 * eY * n1 + pk * n2; n += pk * nn;
    }
    const v: [number, number, number] = [m1, m2, n];
    memo.set(key, v);
    return v;
  };
  const a = Math.min(initial, CL_FS_CAP);
  const [m1, m2, eN] = f(a, a);
  return { m1, m2, eN };
}

/** Exact wheel moments per unit bet (credit wedges, free-spin wedges via the DP, upgrade to the outer wheel). */
export function clWheelMoments(fs: ClEnum) {
  const wedge = (w: Wedge, outer: { m1: number; m2: number }) => {
    if (w.kind === "credit") return { m1: w.x, m2: w.x * w.x };
    if (w.kind === "fs") { const f = clFreeSpinMoments(w.spins, fs); return { m1: f.m1, m2: f.m2 }; }
    return outer;
  };
  const avg = (ws: Wedge[], outer: { m1: number; m2: number }) => ws.reduce((a, w) => { const m = wedge(w, outer); return { m1: a.m1 + m.m1 / ws.length, m2: a.m2 + m.m2 / ws.length }; }, { m1: 0, m2: 0 });
  const outer = avg(CL_OUTER_WHEEL, { m1: 0, m2: 0 });
  const inner = avg(CL_INNER_WHEEL, outer);
  const creditOnly = (ws: Wedge[], o: number) => ws.reduce((a, w) => a + (w.kind === "credit" ? w.x : w.kind === "upgrade" ? o : 0) / ws.length, 0);
  const outerCredit = creditOnly(CL_OUTER_WHEEL, 0);
  const pFs = CL_INNER_WHEEL.filter((w) => w.kind === "fs").length / 12 + (1 / 12) * (CL_OUTER_WHEEL.filter((w) => w.kind === "fs").length / 12);
  return { inner, outer, creditX: creditOnly(CL_INNER_WHEEL, outerCredit), pUpgrade: CL_INNER_WHEEL.filter((w) => w.kind === "upgrade").length / 12, pFreeSpins: pFs };
}

export function cloverExactFull(base: ClEnum = clEnumerate(false), fs: ClEnum = clEnumerate(true)) {
  const fsM = [3, 4, 5].map((k) => clFreeSpinMoments(CL_FS_AWARD[k]!, fs));
  const wh = clWheelMoments(fs);
  let eX = 0, eX2 = 0, fsRtp = 0, whRtp = 0, pFs = 0, pWh = 0, eSpins = 0;
  base.bins.forEach((row, k) => row.forEach((bn, w) => {
    if (!bn.p) return;
    const F = k >= 3 ? fsM[k - 3]! : null;
    const f1 = F?.m1 ?? 0, f2 = F?.m2 ?? 0, h1 = w ? wh.inner.m1 : 0, h2 = w ? wh.inner.m2 : 0;
    eX += bn.eB + bn.p * (f1 + h1);
    eX2 += bn.eB2 + 2 * bn.eB * (f1 + h1) + bn.p * (f2 + h2 + 2 * f1 * h1);
    fsRtp += bn.p * f1; whRtp += bn.p * h1;
    if (F) { pFs += bn.p; eSpins += bn.p * F.eN; }
    if (w) pWh += bn.p;
  }));
  let scatterRtp = 0;
  base.bins.forEach((row, k) => row.forEach((bn) => { scatterRtp += bn.p * CL_SCATTER_PAY[k]!; }));
  return {
    lineRtp: base.rtp - scatterRtp, scatterRtp, baseRtp: base.rtp, freeSpinsRtp: fsRtp, wheelRtp: whRtp, totalRtp: eX,
    sdPerUnit: Math.sqrt(eX2 - eX * eX), hitRate: base.hitRate,
    freeSpinsChance: pFs, wheelChance: pWh, freeSpinsPerFeature: eSpins / pFs, freeSpinFeatureX: fsRtp / pFs,
    wheelExpectedX: wh.inner.m1, wheelUpgradeChance: wh.pUpgrade, wheelFreeSpinsChance: wh.pFreeSpins,
    fsRtpPerSpin: fs.rtp,
  };
}

export const CLOVER_INFO = {
  name: "Kettle of Clover", reels: 5, rows: 3, lines: CL_LINES, betCoins: CL_BET_COINS,
  paytable: CL_PAYTABLE, scatterPay: CL_SCATTER_PAY, freeSpinsAward: CL_FS_AWARD, freeSpinsCap: CL_FS_CAP,
  innerWheel: CL_INNER_WHEEL, outerWheel: CL_OUTER_WHEEL,
};
