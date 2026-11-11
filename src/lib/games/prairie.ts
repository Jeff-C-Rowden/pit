import { randInt, newId } from "../rng";

/**
 * Thunderhoof Prairie: story slot #2. 5 reels x 3 rows, 243 ways (left to right, any row), coin x 10 per spin.
 *
 * Honest by construction:
 * - Every reel is a fixed 30-stop strip; the server picks every stop uniformly at random. The window is the
 *   stop plus its true neighbours. Free spins use the same strips with each WILD printed as a 2x or 3x wild.
 * - Coin values are drawn by the server from one fixed published table, for every coin that lands.
 * - Features are decided and paid on the server in the same request as the spin that triggers them; the client
 *   only replays the result. RTP is exact (see prairieExactFull) and confirmed by a seeded Monte Carlo
 *   (audit/prairie.ts) through playPrairie itself.
 *
 * Ways: a symbol pays when it (or WILD on reels 2-4) shows on reels 1..k, k >= 3, in any row. The pay is
 * pay[k] x (number of matching cells on each of those reels), multiplied in free spins by each wild's 2x/3x.
 * Only the longest run per symbol pays.
 * STORM scatter (one per strip): 3 / 4 / 5 anywhere pay 2x / 5x / 20x the bet and award 8 / 12 / 20 free
 * spins. Free spins retrigger with 3+ STORM, at most 100 free spins per feature. Coins rest in free spins.
 * Hold & Spin: 6+ COIN anywhere in the base game. Coins lock, 3 respins; each empty cell lands a coin with
 * probability 5% per respin; any new coin resets the respins to 3. Ends at 0 respins or a full screen.
 * Pays the sum of all coin values (x bet): 0.5, 1, 2, 3, 5, MINI 10, MINOR 25, MAJOR 100. No progressive.
 */

export const PR_SYMBOLS = ["WILD", "W2", "W3", "STORM", "COIN", "BUFFALO", "EAGLE", "COYOTE", "BOOTS", "A", "K", "Q", "J"] as const;
export type PrSymbol = (typeof PR_SYMBOLS)[number];
export type PrPaySymbol = "BUFFALO" | "EAGLE" | "COYOTE" | "BOOTS" | "A" | "K" | "Q" | "J";
export const PR_PAY_SYMBOLS: PrPaySymbol[] = ["BUFFALO", "EAGLE", "COYOTE", "BOOTS", "A", "K", "Q", "J"];
export const PR_BET_COINS = 10;
export const PR_WAYS = 243;

/** Way pays per coin for 3 / 4 / 5 reels, per way. */
export const PR_PAYTABLE: Record<PrPaySymbol, [number, number, number]> = {
  BUFFALO: [10, 30, 100],
  EAGLE: [6, 20, 60],
  COYOTE: [5, 15, 40],
  BOOTS: [4, 10, 30],
  A: [2, 4, 12],
  K: [2, 4, 12],
  Q: [1, 3, 8],
  J: [1, 3, 8],
};

const S = (s: string) => s.split(" ") as PrSymbol[];
/** 30-stop base strips. STORM once per strip; COIN x4 (one stacked pair); WILD on reels 2-4. */
export const PR_REELS: PrSymbol[][] = [
  S("STORM J BUFFALO BUFFALO Q COIN COIN K A EAGLE J Q COYOTE K COIN BOOTS A J BUFFALO Q K EAGLE COIN BOOTS A BOOTS J COYOTE Q K"),
  S("STORM Q WILD K BUFFALO BUFFALO J COIN COIN A COYOTE Q K EAGLE J COIN BOOTS A Q WILD K BUFFALO J A COIN BOOTS EAGLE Q BOOTS K"),
  S("STORM K A WILD BUFFALO BUFFALO Q COIN COIN J EAGLE K A COYOTE Q COIN BOOTS J K WILD A BUFFALO Q J COIN BOOTS COYOTE K BOOTS A"),
  S("STORM A Q WILD BUFFALO BUFFALO K COIN COIN J COYOTE A Q EAGLE K COIN BOOTS J A WILD Q BUFFALO K J COIN BOOTS EAGLE A BOOTS Q"),
  S("STORM J K BUFFALO BUFFALO A COIN COIN Q EAGLE J K COYOTE A COIN BOOTS Q J BUFFALO K A EAGLE COIN BOOTS Q BOOTS J COYOTE K A"),
];
export const PR_REEL_LEN = 30;
/** Free-spin strips: the same stops, each WILD printed as alternately 2x and 3x. */
export const PR_FS_REELS: PrSymbol[][] = PR_REELS.map((strip) => {
  let n = 0;
  return strip.map((s) => (s === "WILD" ? ((n++ % 2 === 0 ? "W2" : "W3") as PrSymbol) : s));
});

export const PR_SCATTER_PAY = [0, 0, 0, 2, 5, 20] as const;
export const PR_FS_AWARD = [0, 0, 0, 8, 12, 20] as const;
export const PR_FS_CAP = 100;

/** Coin values (x total bet) and their weights out of 1000. */
export const PR_COIN_VALUES = [
  { x: 0.5, w: 350, label: null },
  { x: 1, w: 300, label: null },
  { x: 2, w: 160, label: null },
  { x: 3, w: 90, label: null },
  { x: 5, w: 60, label: null },
  { x: 10, w: 30, label: "MINI" },
  { x: 25, w: 8, label: "MINOR" },
  { x: 100, w: 2, label: "MAJOR" },
] as const;
export const PR_COIN_WEIGHT = 1000;
export const PR_HS_TRIGGER = 6;
export const PR_HS_RESPINS = 3;
/** Per-respin chance (per mille) that an empty cell lands a coin. */
export const PR_HS_Q_PERMILLE = 50;
export const PR_CELLS = 15;

export const PR_MIN_COIN_CENTS = 25;
export const PR_MAX_COIN_CENTS = 5000;

export type Pick = (n: number) => number;

export function prWindow(stops: number[], reels: PrSymbol[][] = PR_REELS): PrSymbol[][] {
  return stops.map((stop, r) => {
    const strip = reels[r]!;
    return [0, 1, 2].map((row) => strip[(stop + row) % strip.length]!);
  });
}

const wildMult = (s: PrSymbol) => (s === "WILD" ? 1 : s === "W2" ? 2 : s === "W3" ? 3 : 0);

export type PrWayWin = { symbol: PrPaySymbol; reels: number; ways: number; mult: number; pay: number; winCents: number };

/** 243-ways evaluation. `factor` per reel = matching cells, where a wild counts its multiplier (1 in the base game). */
export function evaluateWays(grid: PrSymbol[][], coinCents: number): { wins: PrWayWin[]; winCents: number } {
  const wins: PrWayWin[] = [];
  let total = 0;
  for (const s of PR_PAY_SYMBOLS) {
    let product = 1, ways = 1, k = 0;
    for (let r = 0; r < 5; r++) {
      let f = 0, n = 0;
      for (const c of grid[r]!) {
        if (c === s) { f += 1; n += 1; } else if (r > 0) { const m = wildMult(c); if (m) { f += m; n += 1; } }
      }
      if (f === 0) break;
      product *= f; ways *= n; k++;
    }
    if (k >= 3) {
      const pay = PR_PAYTABLE[s][k - 3] * product;
      wins.push({ symbol: s, reels: k, ways, mult: product / ways, pay, winCents: pay * coinCents });
      total += pay * coinCents;
    }
  }
  return { wins, winCents: total };
}

export const countSym = (grid: PrSymbol[][], s: PrSymbol) => grid.reduce((a, col) => a + col.filter((c) => c === s).length, 0);
export const scatterReels = (grid: PrSymbol[][]) => grid.reduce((a, col) => a + (col.includes("STORM") ? 1 : 0), 0);

export function drawCoinValue(pick: Pick): number {
  let t = pick(PR_COIN_WEIGHT);
  for (const v of PR_COIN_VALUES) { if (t < v.w) return v.x; t -= v.w; }
  return PR_COIN_VALUES[0].x;
}
export const coinLabel = (x: number) => PR_COIN_VALUES.find((v) => v.x === x)?.label ?? null;

export type PrGrid = {
  grid: PrSymbol[][];
  wins: PrWayWin[];
  waysWinCents: number;
  scatters: number;
  scatterWinCents: number;
  freeSpinsAwarded: number;
};

function gridResult(grid: PrSymbol[][], coinCents: number): PrGrid {
  const w = evaluateWays(grid, coinCents);
  const scatters = scatterReels(grid);
  return {
    grid, wins: w.wins, waysWinCents: w.winCents, scatters,
    scatterWinCents: PR_SCATTER_PAY[scatters]! * coinCents * PR_BET_COINS,
    freeSpinsAwarded: PR_FS_AWARD[scatters]!,
  };
}

export type PrFreeSpin = { n: number; grid: PrSymbol[][]; wins: PrWayWin[]; scatters: number; winCents: number; retrigger: number; awardedTotal: number };
export type PrFreeSpins = { initial: number; spins: PrFreeSpin[]; totalWinCents: number; capped: boolean };

export function runPrFreeSpins(coinCents: number, initial: number, pick: Pick): PrFreeSpins {
  let awarded = Math.min(initial, PR_FS_CAP), remaining = awarded, total = 0, capped = false;
  const spins: PrFreeSpin[] = [];
  while (remaining > 0) {
    remaining--;
    const g = gridResult(prWindow(PR_FS_REELS.map((s) => pick(s.length)), PR_FS_REELS), coinCents);
    const win = g.waysWinCents + g.scatterWinCents;
    let add = 0;
    if (g.freeSpinsAwarded > 0) {
      add = Math.min(g.freeSpinsAwarded, PR_FS_CAP - awarded);
      if (add < g.freeSpinsAwarded) capped = true;
      awarded += add; remaining += add;
    }
    total += win;
    spins.push({ n: spins.length + 1, grid: g.grid, wins: g.wins, scatters: g.scatters, winCents: win, retrigger: add, awardedTotal: awarded });
  }
  return { initial: Math.min(initial, PR_FS_CAP), spins, totalWinCents: total, capped };
}

/** cells are numbered reel * 3 + row. */
export type PrRespin = { landed: { cell: number; x: number }[]; respinsLeft: number };
export type PrHoldSpin = { start: { cell: number; x: number }[]; respins: PrRespin[]; board: (number | null)[]; totalX: number; totalWinCents: number; full: boolean };

export function runHoldSpin(betCents: number, start: { cell: number; x: number }[], pick: Pick): PrHoldSpin {
  const board: (number | null)[] = Array(PR_CELLS).fill(null);
  for (const c of start) board[c.cell] = c.x;
  let left = PR_HS_RESPINS;
  const respins: PrRespin[] = [];
  while (left > 0 && board.some((v) => v === null)) {
    const landed: { cell: number; x: number }[] = [];
    for (let i = 0; i < PR_CELLS; i++) {
      if (board[i] !== null) continue;
      if (pick(1000) < PR_HS_Q_PERMILLE) { const x = drawCoinValue(pick); board[i] = x; landed.push({ cell: i, x }); }
    }
    left = landed.length ? PR_HS_RESPINS : left - 1;
    respins.push({ landed, respinsLeft: left });
  }
  const totalX = board.reduce<number>((a, v) => a + (v ?? 0), 0);
  return { start, respins, board, totalX, totalWinCents: Math.round(totalX * betCents), full: board.every((v) => v !== null) };
}

export type PrairieSpin = {
  id: string; coinCents: number; betCents: number;
  base: PrGrid; coins: (number | null)[][]; baseWinCents: number;
  freeSpins: PrFreeSpins | null; hold: PrHoldSpin | null; winCents: number;
};

export function playPrairie(coinCents: number, pick: Pick = randInt): PrairieSpin {
  if (!Number.isInteger(coinCents) || coinCents < PR_MIN_COIN_CENTS || coinCents > PR_MAX_COIN_CENTS) {
    throw new Error("coin size must be an integer between $0.25 and $50.00");
  }
  const betCents = coinCents * PR_BET_COINS;
  const base = gridResult(prWindow(PR_REELS.map((s) => pick(s.length))), coinCents);
  const coins = base.grid.map((col) => col.map((s) => (s === "COIN" ? drawCoinValue(pick) : null)));
  const start: { cell: number; x: number }[] = [];
  coins.forEach((col, r) => col.forEach((x, row) => { if (x !== null) start.push({ cell: r * 3 + row, x }); }));
  const hold = start.length >= PR_HS_TRIGGER ? runHoldSpin(betCents, start, pick) : null;
  const freeSpins = base.freeSpinsAwarded > 0 ? runPrFreeSpins(coinCents, base.freeSpinsAwarded, pick) : null;
  const baseWinCents = base.waysWinCents + base.scatterWinCents;
  const winCents = baseWinCents + (hold?.totalWinCents ?? 0) + (freeSpins?.totalWinCents ?? 0);
  return { id: newId(), coinCents, betCents, base, coins, baseWinCents, freeSpins, hold, winCents };
}

export function publicPrairieSpin(s: PrairieSpin) {
  return {
    id: s.id, coinCents: s.coinCents, betCents: s.betCents,
    grid: s.base.grid, coins: s.coins, wins: s.base.wins, waysWinCents: s.base.waysWinCents,
    scatters: s.base.scatters, scatterWinCents: s.base.scatterWinCents, baseWinCents: s.baseWinCents,
    freeSpins: s.freeSpins, hold: s.hold, winCents: s.winCents,
  };
}

// ---------------------------------------------------------------- exact math

function windows(reels: PrSymbol[][]) {
  return reels.map((strip) => strip.map((_, st) => [0, 1, 2].map((k) => strip[(st + k) % strip.length]!)));
}

/** Exact ways RTP per unit bet from independent reels: E = pay x E[f1]..E[fk] x P(f_{k+1} = 0). */
export function waysRtpExact(reels: PrSymbol[][]): number {
  const ws = windows(reels);
  let e = 0;
  for (const s of PR_PAY_SYMBOLS) {
    const Ef: number[] = [], P0: number[] = [];
    ws.forEach((reel, r) => {
      let sf = 0, z = 0;
      for (const w of reel) {
        let f = 0;
        for (const c of w) { if (c === s) f += 1; else if (r > 0) f += wildMult(c); }
        sf += f; if (f === 0) z++;
      }
      Ef.push(sf / reel.length); P0.push(z / reel.length);
    });
    for (let k = 3; k <= 5; k++) {
      let pr = 1;
      for (let i = 0; i < k; i++) pr *= Ef[i]!;
      if (k < 5) pr *= P0[k]!;
      e += pr * PR_PAYTABLE[s][k - 3];
    }
  }
  return e / PR_BET_COINS;
}

/** Distribution of a per-reel window count, convolved over the 5 reels. */
function convolve(reels: PrSymbol[][], count: (w: PrSymbol[]) => number): number[] {
  let dist = [1];
  for (const reel of windows(reels)) {
    const local: number[] = [];
    for (const w of reel) { const c = count(w); local[c] = (local[c] ?? 0) + 1 / reel.length; }
    const next: number[] = [];
    dist.forEach((p, a) => local.forEach((q, b) => { if (q) next[a + b] = (next[a + b] ?? 0) + p * q; }));
    dist = next.map((v) => v ?? 0);
  }
  return dist;
}
export const prScatterLaw = (reels = PR_REELS) => { const d = convolve(reels, (w) => (w.includes("STORM") ? 1 : 0)); while (d.length < 6) d.push(0); return d; };
export const prCoinLaw = () => { const d = convolve(PR_REELS, (w) => w.filter((c) => c === "COIN").length); while (d.length < 16) d.push(0); return d; };

export const coinMean = () => PR_COIN_VALUES.reduce((a, v) => a + (v.x * v.w) / PR_COIN_WEIGHT, 0);
export const coinSecond = () => PR_COIN_VALUES.reduce((a, v) => a + (v.x * v.x * v.w) / PR_COIN_WEIGHT, 0);

function binom(n: number, k: number, p: number) {
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c * p ** k * (1 - p) ** (n - k);
}

/** Exact distribution of the final coin count for a Hold & Spin starting with n coins. */
export function holdFinalLaw(n: number): number[] {
  const q = PR_HS_Q_PERMILLE / 1000;
  const memo = new Map<number, number[]>();
  const f = (coins: number, left: number): number[] => {
    if (coins >= PR_CELLS || left === 0) { const d = Array(PR_CELLS + 1).fill(0); d[coins] = 1; return d; }
    const key = coins * 10 + left;
    const hit = memo.get(key); if (hit) return hit;
    const out = Array(PR_CELLS + 1).fill(0);
    const empty = PR_CELLS - coins;
    for (let k = 0; k <= empty; k++) {
      const p = binom(empty, k, q);
      const sub = k ? f(coins + k, PR_HS_RESPINS) : f(coins, left - 1);
      sub.forEach((v, i) => { out[i] += p * v; });
    }
    memo.set(key, out);
    return out;
  };
  return f(n, PR_HS_RESPINS);
}

/** E[total x] and E[total^2] of a Hold & Spin starting with n coins (values i.i.d., independent of the count). */
export function holdMoments(n: number) {
  const law = holdFinalLaw(n);
  const eN = law.reduce((a, p, i) => a + p * i, 0), eN2 = law.reduce((a, p, i) => a + p * i * i, 0);
  const mu = coinMean(), m2 = coinSecond();
  return { eN, m1: eN * mu, m2: eN * (m2 - mu * mu) + eN2 * mu * mu, full: law[PR_CELLS]! };
}

export type PrEnum = {
  combos: number; baseRtp: number; hitRate: number;
  /** bins[k][c] for scatter reels k and coin count c: probability, E[B 1], E[B^2 1]. */
  bins: { p: number; eB: number; eB2: number }[][];
};

/** Full 30^5 enumeration; B = ways + scatter return per unit bet (wild multipliers from `reels`). */
export function prEnumerate(reels: PrSymbol[][] = PR_REELS, countCoins = true): PrEnum {
  const ws = windows(reels);
  const L = PR_REEL_LEN;
  const P = PR_PAY_SYMBOLS.length;
  // per reel/window: factor per pay symbol, scatter flag, coin count
  const fac = ws.map((reel, r) => reel.map((w) => PR_PAY_SYMBOLS.map((s) => w.reduce((a, c) => a + (c === s ? 1 : r > 0 ? wildMult(c) : 0), 0))));
  const sc = ws.map((reel) => reel.map((w) => (w.includes("STORM") ? 1 : 0)));
  const cn = ws.map((reel) => reel.map((w) => (countCoins ? w.filter((c) => c === "COIN").length : 0)));
  const pays = PR_PAY_SYMBOLS.map((s) => PR_PAYTABLE[s]);
  const bins = Array.from({ length: 6 }, () => Array.from({ length: 16 }, () => ({ p: 0, eB: 0, eB2: 0 })));
  let sum = 0, hits = 0, combos = 0;
  for (let a = 0; a < L; a++) { const fa = fac[0]![a]!;
    for (let b = 0; b < L; b++) { const fb = fac[1]![b]!;
      for (let c = 0; c < L; c++) { const fc = fac[2]![c]!;
        for (let d = 0; d < L; d++) { const fd = fac[3]![d]!;
          for (let e = 0; e < L; e++) { const fe = fac[4]![e]!;
            let pay = 0;
            for (let i = 0; i < P; i++) {
              const x1 = fa[i]!, x2 = fb[i]!, x3 = fc[i]!;
              if (!x1 || !x2 || !x3) continue;
              const x4 = fd[i]!;
              if (!x4) { pay += pays[i]![0] * x1 * x2 * x3; continue; }
              const x5 = fe[i]!;
              if (!x5) { pay += pays[i]![1] * x1 * x2 * x3 * x4; continue; }
              pay += pays[i]![2] * x1 * x2 * x3 * x4 * x5;
            }
            const k = sc[0]![a]! + sc[1]![b]! + sc[2]![c]! + sc[3]![d]! + sc[4]![e]!;
            const cc = cn[0]![a]! + cn[1]![b]! + cn[2]![c]! + cn[3]![d]! + cn[4]![e]!;
            const unit = pay / PR_BET_COINS + PR_SCATTER_PAY[k]!;
            const bin = bins[k]![cc]!;
            bin.p++; bin.eB += unit; bin.eB2 += unit * unit;
            sum += unit; combos++;
            if (unit > 0 || k >= 3 || cc >= PR_HS_TRIGGER) hits++;
          } } } } }
  for (const row of bins) for (const bn of row) { bn.p /= combos; bn.eB /= combos; bn.eB2 /= combos; }
  return { combos, baseRtp: sum / combos, hitRate: hits / combos, bins };
}

/** Exact free-spin feature moments by DP over (awarded, remaining), from the joint law of (Y, k) on the FS strips. */
export function prFreeSpinMoments(initial: number, fsEnum: PrEnum): { m1: number; m2: number; eN: number } {
  const byK = fsEnum.bins.map((row) => row.reduce((a, b) => ({ p: a.p + b.p, eB: a.eB + b.eB, eB2: a.eB2 + b.eB2 }), { p: 0, eB: 0, eB2: 0 }));
  const memo = new Map<number, [number, number, number]>();
  const f = (awarded: number, remaining: number): [number, number, number] => {
    if (remaining <= 0) return [0, 0, 0];
    const key = awarded * 1000 + remaining;
    const hit = memo.get(key); if (hit) return hit;
    let m1 = 0, m2 = 0, n = 1;
    for (let k = 0; k <= 5; k++) {
      const add = Math.min(PR_FS_AWARD[k]!, PR_FS_CAP - awarded);
      const [n1, n2, nn] = f(awarded + add, remaining - 1 + add);
      const pk = byK[k]!.p, eY = byK[k]!.eB, eY2 = byK[k]!.eB2;
      m1 += eY + pk * n1; m2 += eY2 + 2 * eY * n1 + pk * n2; n += pk * nn;
    }
    const v: [number, number, number] = [m1, m2, n];
    memo.set(key, v);
    return v;
  };
  const a = Math.min(initial, PR_FS_CAP);
  const [m1, m2, eN] = f(a, a);
  return { m1, m2, eN };
}

/** Exact total RTP, its parts, feature chances and SD per unit bet. */
export function prairieExactFull(base: PrEnum = prEnumerate(), fs: PrEnum = prEnumerate(PR_FS_REELS, false)) {
  let eX = 0, eX2 = 0, fsRtp = 0, hsRtp = 0, pFs = 0, pHs = 0, eFsSpins = 0, pFull = 0;
  const fsM = [3, 4, 5].map((k) => prFreeSpinMoments(PR_FS_AWARD[k]!, fs));
  const hsM = Array.from({ length: 16 }, (_, c) => (c >= PR_HS_TRIGGER ? holdMoments(c) : null));
  base.bins.forEach((row, k) => row.forEach((bn, c) => {
    if (!bn.p) return;
    const F = k >= 3 ? fsM[k - 3]! : null, H = hsM[c];
    const f1 = F?.m1 ?? 0, f2 = F?.m2 ?? 0, h1 = H?.m1 ?? 0, h2 = H?.m2 ?? 0;
    eX += bn.eB + bn.p * (f1 + h1);
    eX2 += bn.eB2 + 2 * bn.eB * (f1 + h1) + bn.p * (f2 + h2 + 2 * f1 * h1);
    fsRtp += bn.p * f1; hsRtp += bn.p * h1;
    if (F) { pFs += bn.p; eFsSpins += bn.p * F.eN; }
    if (H) { pHs += bn.p; pFull += bn.p * H.full; }
  }));
  const law = prScatterLaw();
  const scatterRtp = law.reduce((a, p, k) => a + p * PR_SCATTER_PAY[k]!, 0);
  return {
    waysRtp: base.baseRtp - scatterRtp, scatterRtp, baseRtp: base.baseRtp, freeSpinsRtp: fsRtp, holdRtp: hsRtp, totalRtp: eX,
    sdPerUnit: Math.sqrt(eX2 - eX * eX), hitRate: base.hitRate,
    freeSpinsChance: pFs, holdChance: pHs, freeSpinsPerFeature: eFsSpins / pFs,
    freeSpinFeatureX: fsRtp / pFs, holdFeatureX: hsRtp / pHs, holdFullScreenChance: pFull / pHs,
    fsWaysRtpPerSpin: fs.baseRtp,
  };
}

export const PRAIRIE_INFO = {
  name: "Thunderhoof Prairie",
  reels: 5, rows: 3, ways: PR_WAYS, betCoins: PR_BET_COINS,
  paytable: PR_PAYTABLE, scatterPay: PR_SCATTER_PAY, freeSpinsAward: PR_FS_AWARD, freeSpinsCap: PR_FS_CAP,
  coinValues: PR_COIN_VALUES, holdTrigger: PR_HS_TRIGGER, holdRespins: PR_HS_RESPINS, holdCoinChancePct: PR_HS_Q_PERMILLE / 10,
};
