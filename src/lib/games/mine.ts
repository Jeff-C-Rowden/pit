import { randInt, newId } from "../rng";

/**
 * Canary Creek Mine: a story slot. 5 reels x 3 rows, 9 left-to-right lines, coin x 9 per spin.
 *
 * Honest by construction:
 * - Every reel is a fixed 30-stop strip and the server picks every stop uniformly at random.
 *   The window is the stop plus its true neighbours. Nothing is weighted, re-picked or staged.
 * - Features are decided and paid on the server in the same request as the spin that triggers
 *   them: every free spin is drawn from the same strips, and the mine-cart pick board is
 *   shuffled at trigger time. The client only replays the result.
 * - Mine-cart picks reveal a pre-drawn ORDER: whichever cart you tap shows the next result in
 *   that order, so no choice is better or worse than another and there is no fake choice.
 * - RTP is exact (closed form, see mineExact) and confirmed by a seeded Monte Carlo
 *   (audit/mine.ts) through playMine itself.
 *
 * Features
 * - DYNAMITE scatter (one per strip, all reels): 3 / 4 / 5 anywhere pay 2x / 10x / 50x the total
 *   bet and award 7 / 10 / 15 free spins.
 * - Free spins: same reels and bet, with the LANTERN MULTIPLIER (research #5 slice 3). It starts at x1
 *   and climbs +1 after every free spin that pays anything (lines or dynamite), up to x4; it never
 *   drops and carries through retriggers. A spin pays its own lines + scatter times the multiplier it
 *   started with, so the meter always equals 1 + paying free spins already shown (max 4).
 *   3+ DYNAMITE retrigger the same awards. At most 100 free spins per feature in total (a retrigger
 *   past the cap adds only up to it). Mine carts do nothing during free spins.
 * - CART bonus symbol (two per strip, reels 1, 3 and 5 only): one on each of reels 1, 3 and 5
 *   (any row) opens the Mine Cart pick. 12 carts hold 9 ore prizes (2,2,3,3,4,5,6,8,12 x bet)
 *   and 3 COLLECT lamps. Picks reveal prizes until a COLLECT; the first pick is always a prize.
 * - WILD (Clem's lantern-hat, reels 2-4) substitutes for every pay symbol, not DYNAMITE or CART.
 */

export const MINE_SYMBOLS = ["WILD", "DYNAMITE", "CART", "NUGGET", "CANARY", "PICK", "LANTERN", "PAN", "ORE"] as const;
export type MineSymbol = (typeof MINE_SYMBOLS)[number];
export type MinePaySymbol = Exclude<MineSymbol, "WILD" | "DYNAMITE" | "CART">;
export const MINE_PAY_SYMBOLS: MinePaySymbol[] = ["NUGGET", "CANARY", "PICK", "LANTERN", "PAN", "ORE"];

export const MINE_PAYLINES: number[][] = [
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
export const MINE_LINES = MINE_PAYLINES.length;

/** Line pays per coin for 3 / 4 / 5 of a kind, left to right. */
export const MINE_PAYTABLE: Record<MinePaySymbol, [number, number, number]> = {
  NUGGET: [25, 100, 500],
  CANARY: [15, 60, 250],
  PICK: [10, 40, 150],
  LANTERN: [6, 20, 80],
  PAN: [4, 13, 50],
  ORE: [2, 8, 30],
};

const S = (s: string) => s.split(" ") as MineSymbol[];
/** 30-stop strips. DYNAMITE once per strip; CART twice on reels 1/3/5, 10 stops apart. */
export const MINE_REELS: MineSymbol[][] = [
  S("DYNAMITE ORE CANARY LANTERN PAN ORE NUGGET PICK LANTERN ORE CART PAN CANARY ORE PAN LANTERN PICK ORE PAN ORE CART LANTERN NUGGET CANARY ORE PAN PICK LANTERN ORE PAN"),
  S("DYNAMITE ORE CANARY LANTERN WILD PAN PICK ORE NUGGET LANTERN PAN ORE PICK CANARY WILD PAN LANTERN ORE PAN PICK LANTERN ORE NUGGET CANARY WILD PAN ORE LANTERN PICK PAN"),
  S("DYNAMITE ORE LANTERN CANARY WILD PAN ORE PICK LANTERN NUGGET CART ORE PAN CANARY WILD LANTERN ORE PAN PICK LANTERN CART ORE PAN CANARY WILD NUGGET ORE LANTERN PICK PAN"),
  S("DYNAMITE PAN ORE LANTERN PAN CANARY WILD PICK ORE LANTERN PAN NUGGET ORE PICK PAN CANARY WILD LANTERN ORE PAN PICK LANTERN ORE PAN CANARY WILD NUGGET ORE LANTERN PICK"),
  S("DYNAMITE PAN PICK ORE LANTERN ORE PAN CANARY ORE PAN CART LANTERN PICK ORE NUGGET PAN LANTERN CANARY ORE ORE CART PAN PICK LANTERN ORE PAN CANARY ORE LANTERN NUGGET"),
];
export const MINE_REEL_LEN = 30;
export const MINE_CART_REELS = [0, 2, 4] as const;

/** DYNAMITE pays x total bet for 0..5 on screen. */
export const MINE_SCATTER_PAY = [0, 0, 0, 2, 10, 50] as const;
/** Free spins awarded for 0..5 DYNAMITE. */
export const MINE_FS_AWARD = [0, 0, 0, 7, 10, 15] as const;
/** Lantern Multiplier: starts at x1, +1 after each paying free spin, never above x4. */
export const MINE_FS_MULT_START = 1;
export const MINE_FS_MULT_MAX = 4;
export const MINE_FS_CAP = 100;

/** Mine Cart pick board: prizes are x total bet. */
export const MINE_PICK_PRIZES = [2, 2, 3, 3, 4, 5, 6, 8, 12] as const;
export const MINE_PICK_COLLECTS = 3;
export const MINE_PICK_CARTS = MINE_PICK_PRIZES.length + MINE_PICK_COLLECTS; // 12

export const MINE_MIN_COIN_CENTS = 25;
export const MINE_MAX_COIN_CENTS = 5000;

export type Pick = (n: number) => number;

export function mineWindow(stops: number[]): MineSymbol[][] {
  return stops.map((stop, r) => {
    const strip = MINE_REELS[r]!;
    return [0, 1, 2].map((row) => strip[(stop + row) % strip.length]!);
  });
}

export type MineLineWin = { line: number; symbol: MinePaySymbol; count: number; pay: number; winCents: number };

/** One line, left to right. Reel 1 never holds a WILD, so the first symbol sets the line. */
export function evaluateMineLine(syms: MineSymbol[]): { symbol: MinePaySymbol; count: number; pay: number } | null {
  const first = syms[0]!;
  if (first === "WILD" || first === "DYNAMITE" || first === "CART") return null;
  let count = 1;
  for (let i = 1; i < syms.length; i++) {
    const s = syms[i]!;
    if (s === first || s === "WILD") count++;
    else break;
  }
  if (count < 3) return null;
  return { symbol: first, count, pay: MINE_PAYTABLE[first][count - 3] };
}

export function scatterCount(grid: MineSymbol[][]): number {
  let n = 0;
  for (const reel of grid) if (reel.includes("DYNAMITE")) n++;
  return n;
}

export function cartTrigger(grid: MineSymbol[][]): boolean {
  return MINE_CART_REELS.every((r) => grid[r]!.includes("CART"));
}

export type MineGridResult = {
  stops: number[];
  grid: MineSymbol[][];
  lineWins: MineLineWin[];
  lineWinCents: number;
  scatters: number;
  scatterWinCents: number;
  /** Free spins this grid awards (base trigger or retrigger), before the cap. */
  freeSpinsAwarded: number;
  cart: boolean;
};

export function evaluateMineGrid(grid: MineSymbol[][], coinCents: number, stops: number[] = []): MineGridResult {
  const lineWins: MineLineWin[] = [];
  let lineWinCents = 0;
  MINE_PAYLINES.forEach((pattern, i) => {
    const ev = evaluateMineLine(pattern.map((row, reel) => grid[reel]![row]!));
    if (ev) {
      const w = ev.pay * coinCents;
      lineWins.push({ line: i, ...ev, winCents: w });
      lineWinCents += w;
    }
  });
  const scatters = scatterCount(grid);
  return {
    stops,
    grid,
    lineWins,
    lineWinCents,
    scatters,
    scatterWinCents: MINE_SCATTER_PAY[scatters]! * coinCents * MINE_LINES,
    freeSpinsAwarded: MINE_FS_AWARD[scatters]!,
    cart: cartTrigger(grid),
  };
}

function spinGrid(coinCents: number, pick: Pick): MineGridResult {
  const stops = MINE_REELS.map((s) => pick(s.length));
  return evaluateMineGrid(mineWindow(stops), coinCents, stops);
}

export type MineFreeSpin = {
  n: number;
  grid: MineSymbol[][];
  lineWins: MineLineWin[];
  scatters: number;
  /** Lantern Multiplier this spin was paid at (1..4). */
  mult: number;
  /** Lines + scatter before the multiplier. */
  baseWinCents: number;
  /** Multiplied win for this free spin: baseWinCents x mult. */
  winCents: number;
  /** Extra spins actually added by a retrigger on this spin (after the cap). */
  retrigger: number;
  /** Total spins awarded so far in this feature, after this spin. */
  awardedTotal: number;
};

export type MineFreeSpins = { initial: number; spins: MineFreeSpin[]; totalWinCents: number; capped: boolean; maxMult: number };

/**
 * The Lantern Multiplier a free spin is paid at, read only from the spins before it: 1 + how many of
 * them paid anything, capped at x4. Client-safe; the page meter uses exactly this.
 */
export function lanternMultAt(spins: { baseWinCents?: number; winCents: number }[], idx: number): number {
  let m = MINE_FS_MULT_START;
  for (let i = 0; i < Math.min(idx, spins.length); i++) if ((spins[i]!.baseWinCents ?? spins[i]!.winCents) > 0) m = Math.min(m + 1, MINE_FS_MULT_MAX);
  return m;
}

export function runFreeSpins(coinCents: number, initial: number, pick: Pick): MineFreeSpins {
  let awarded = Math.min(initial, MINE_FS_CAP);
  let remaining = awarded;
  const spins: MineFreeSpin[] = [];
  let total = 0;
  let capped = false;
  let mult = MINE_FS_MULT_START;
  while (remaining > 0) {
    remaining--;
    const g = spinGrid(coinCents, pick);
    const base = g.lineWinCents + g.scatterWinCents;
    const win = base * mult;
    let add = 0;
    if (g.freeSpinsAwarded > 0) {
      add = Math.min(g.freeSpinsAwarded, MINE_FS_CAP - awarded);
      if (add < g.freeSpinsAwarded) capped = true;
      awarded += add;
      remaining += add;
    }
    total += win;
    spins.push({ n: spins.length + 1, grid: g.grid, lineWins: g.lineWins, scatters: g.scatters, mult, baseWinCents: base, winCents: win, retrigger: add, awardedTotal: awarded });
    if (base > 0) mult = Math.min(mult + 1, MINE_FS_MULT_MAX);
  }
  return { initial: Math.min(initial, MINE_FS_CAP), spins, totalWinCents: total, capped, maxMult: spins.reduce((a, sp) => Math.max(a, sp.mult), MINE_FS_MULT_START) };
}

export type CartItem = { kind: "prize"; x: number } | { kind: "collect" };
export type MinePick = {
  /** Results in reveal order, ending with the COLLECT (or the last prize if none are left). */
  reveals: CartItem[];
  totalX: number;
  totalWinCents: number;
};

/**
 * Draw the reveal order at trigger time: the first reveal is a uniformly chosen prize, the other
 * 11 contents are uniformly shuffled. Reveals run until the first COLLECT.
 */
export function drawPick(betCents: number, pick: Pick): MinePick {
  const prizes: CartItem[] = MINE_PICK_PRIZES.map((x) => ({ kind: "prize", x }));
  const firstIdx = pick(prizes.length);
  const first = prizes.splice(firstIdx, 1)[0]!;
  const rest: CartItem[] = [...prizes, ...Array.from({ length: MINE_PICK_COLLECTS }, () => ({ kind: "collect" }) as CartItem)];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  const reveals: CartItem[] = [first];
  for (const it of rest) {
    reveals.push(it);
    if (it.kind === "collect") break;
  }
  const totalX = reveals.reduce((a, r) => a + (r.kind === "prize" ? r.x : 0), 0);
  return { reveals, totalX, totalWinCents: totalX * betCents };
}

export type MineSpin = {
  id: string;
  coinCents: number;
  betCents: number;
  base: MineGridResult;
  baseWinCents: number;
  freeSpins: MineFreeSpins | null;
  pick: MinePick | null;
  winCents: number;
};

export function playMine(coinCents: number, pick: Pick = randInt): MineSpin {
  if (!Number.isInteger(coinCents) || coinCents < MINE_MIN_COIN_CENTS || coinCents > MINE_MAX_COIN_CENTS) {
    throw new Error("coin size must be an integer between $0.25 and $50.00");
  }
  const betCents = coinCents * MINE_LINES;
  const base = spinGrid(coinCents, pick);
  const baseWinCents = base.lineWinCents + base.scatterWinCents;
  const pk = base.cart ? drawPick(betCents, pick) : null;
  const fs = base.freeSpinsAwarded > 0 ? runFreeSpins(coinCents, base.freeSpinsAwarded, pick) : null;
  const winCents = baseWinCents + (pk?.totalWinCents ?? 0) + (fs?.totalWinCents ?? 0);
  return { id: newId(), coinCents, betCents, base, baseWinCents, freeSpins: fs, pick: pk, winCents };
}

export function publicMineSpin(s: MineSpin) {
  return {
    id: s.id,
    coinCents: s.coinCents,
    betCents: s.betCents,
    grid: s.base.grid,
    lineWins: s.base.lineWins,
    lineWinCents: s.base.lineWinCents,
    scatters: s.base.scatters,
    scatterWinCents: s.base.scatterWinCents,
    baseWinCents: s.baseWinCents,
    freeSpins: s.freeSpins,
    pick: s.pick,
    winCents: s.winCents,
  };
}

// ---------------------------------------------------------------- exact math

const freq = (r: number, s: MineSymbol) => MINE_REELS[r]!.filter((x) => x === s).length / MINE_REEL_LEN;

/** Exact line return per unit bet. Every row of a uniformly stopped strip has the strip's symbol mix. */
export function mineLineRtpExact(): number {
  let e = 0;
  for (const s of MINE_PAY_SYMBOLS) {
    const p0 = freq(0, s);
    const q = [1, 2, 3, 4].map((r) => freq(r, s) + freq(r, "WILD"));
    for (let k = 3; k <= 5; k++) {
      let pr = p0;
      for (let i = 1; i < k; i++) pr *= q[i - 1]!;
      if (k < 5) pr *= 1 - q[k - 1]!;
      e += pr * MINE_PAYTABLE[s][k - 3];
    }
  }
  return e; // per coin per line == per unit of total bet
}

/** Exact distribution of DYNAMITE reels on screen (0..5). One per strip, so P(visible) = 3/30 each. */
export function scatterLaw(): number[] {
  let dist = [1];
  for (let r = 0; r < 5; r++) {
    const strip = MINE_REELS[r]!;
    let vis = 0;
    for (let st = 0; st < strip.length; st++) if ([0, 1, 2].some((k) => strip[(st + k) % strip.length] === "DYNAMITE")) vis++;
    const p = vis / strip.length;
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((v, k) => { next[k] += v * (1 - p); next[k + 1] += v * p; });
    dist = next;
  }
  return dist;
}

export function cartProbExact(): number {
  let p = 1;
  for (const r of MINE_CART_REELS) {
    const strip = MINE_REELS[r]!;
    let vis = 0;
    for (let st = 0; st < strip.length; st++) if ([0, 1, 2].some((k) => strip[(st + k) % strip.length] === "CART")) vis++;
    p *= vis / strip.length;
  }
  return p;
}

/** Expected free spins played for an initial award, with retriggers and the 100-spin cap (exact DP). */
export function expectedFreeSpins(initial: number, law = scatterLaw()): number {
  const memo = new Map<string, number>();
  const f = (awarded: number, remaining: number): number => {
    if (remaining <= 0) return 0;
    const key = `${awarded},${remaining}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let v = 1;
    for (let k = 0; k <= 5; k++) {
      const add = Math.min(MINE_FS_AWARD[k]!, MINE_FS_CAP - awarded);
      v += law[k]! * f(awarded + add, remaining - 1 + add);
    }
    memo.set(key, v);
    return v;
  };
  const a = Math.min(initial, MINE_FS_CAP);
  return f(a, a);
}

/** Expected Mine Cart total in x bet: first reveal averages S/9; each other prize precedes all 3 collects w.p. 1/4. */
export function pickExpectedX(): number {
  const sum = MINE_PICK_PRIZES.reduce((a, b) => a + b, 0);
  const n = MINE_PICK_PRIZES.length;
  return sum / n + ((sum * (n - 1)) / n) / (MINE_PICK_COLLECTS + 1);
}

export type MineExact = {
  lineRtp: number;
  scatterRtp: number;
  baseRtp: number;
  freeSpinsRtp: number;
  pickRtp: number;
  totalRtp: number;
  freeSpinsChance: number;
  pickChance: number;
  expectedFreeSpinsPerFeature: number;
  freeSpinValueX: number;
  pickExpectedX: number;
};

/**
 * Exact RTP. Lines, scatter and pick are closed form; free spins use the exact Lantern Multiplier DP
 * (freeSpinMoments), which needs P(spin pays) per scatter count from the 30^5 enumeration (cached).
 */
export function mineExact(en: MineEnumeration = mineEnumerate()): MineExact {
  const law = scatterLaw();
  const lineRtp = mineLineRtpExact();
  const scatterRtp = law.reduce((a, p, k) => a + p * MINE_SCATTER_PAY[k]!, 0);
  let freeSpinsRtp = 0;
  let freeSpinsChance = 0;
  let eSpins = 0;
  for (let k = 3; k <= 5; k++) {
    const n = expectedFreeSpins(MINE_FS_AWARD[k]!, law);
    freeSpinsRtp += law[k]! * freeSpinMoments(MINE_FS_AWARD[k]!, en).m1;
    freeSpinsChance += law[k]!;
    eSpins += law[k]! * n;
  }
  const pickChance = cartProbExact();
  const px = pickExpectedX();
  const pickRtp = pickChance * px;
  const baseRtp = lineRtp + scatterRtp;
  return {
    lineRtp, scatterRtp, baseRtp, freeSpinsRtp, pickRtp,
    totalRtp: baseRtp + freeSpinsRtp + pickRtp,
    freeSpinsChance, pickChance,
    expectedFreeSpinsPerFeature: eSpins / freeSpinsChance,
    freeSpinValueX: freeSpinsRtp / freeSpinsChance,
    pickExpectedX: px,
  };
}

export type MineEnumeration = {
  combos: number;
  baseRtp: number;
  baseSd: number;
  /** Any return or feature trigger. */
  hitRate: number;
  /** Net win on the base grid alone (lines + scatter > bet), features excluded. */
  baseWinRate: number;
  lineHitRate: number;
  /** Per scatter count k = 0..5: P(k), E[B 1{k}], E[B^2 1{k}], P(k and cart trigger), P(k and B > 0). B = base return per unit bet. */
  byScatter: { p: number; eB: number; eB2: number; pCart: number; pPay: number }[];
  /** E[B 1{cart}] */
  eBCart: number;
  pCart: number;
};

/**
 * Full 30^5 enumeration of the base grid (24.3M windows, about 4 s): exact base line + scatter
 * RTP, hit rate, and the joint moments needed for the exact SD. Not used at request time.
 */
let enumCache: MineEnumeration | null = null;
export function mineEnumerate(): MineEnumeration {
  if (enumCache) return enumCache;
  enumCache = mineEnumerateUncached();
  return enumCache;
}
function mineEnumerateUncached(): MineEnumeration {
  const L = MINE_REEL_LEN;
  const win = MINE_REELS.map((strip) => strip.map((_, st) => [0, 1, 2].map((k) => strip[(st + k) % L]!)));
  const scat = win.map((ws) => ws.map((w) => (w.includes("DYNAMITE") ? 1 : 0)));
  const cart = win.map((ws) => ws.map((w) => w.includes("CART")));
  let sum = 0, sum2 = 0, hits = 0, combos = 0, anyLine = 0, baseWins = 0, bCart = 0, nCart = 0;
  const by = Array.from({ length: 6 }, () => ({ n: 0, b: 0, b2: 0, cart: 0, pay: 0 }));
  const g: MineSymbol[][] = [[], [], [], [], []];
  const lineSyms: MineSymbol[] = ["ORE", "ORE", "ORE", "ORE", "ORE"];
  for (let a = 0; a < L; a++) { g[0] = win[0]![a]!;
    for (let b = 0; b < L; b++) { g[1] = win[1]![b]!;
      for (let c = 0; c < L; c++) { g[2] = win[2]![c]!;
        for (let d = 0; d < L; d++) { g[3] = win[3]![d]!;
          for (let e = 0; e < L; e++) { g[4] = win[4]![e]!;
            let pay = 0;
            for (const pat of MINE_PAYLINES) {
              for (let r = 0; r < 5; r++) lineSyms[r] = g[r]![pat[r]!]!;
              const ev = evaluateMineLine(lineSyms);
              if (ev) pay += ev.pay;
            }
            const sc = scat[0]![a]! + scat[1]![b]! + scat[2]![c]! + scat[3]![d]! + scat[4]![e]!;
            const unit = pay / MINE_LINES + MINE_SCATTER_PAY[sc]!;
            const ct = cart[0]![a]! && cart[2]![c]! && cart[4]![e]!;
            sum += unit; sum2 += unit * unit; combos++;
            if (pay > 0) anyLine++;
            if (unit > 1) baseWins++;
            if (unit > 0 || sc >= 3 || ct) hits++;
            const row = by[sc]!;
            row.n++; row.b += unit; row.b2 += unit * unit;
            if (unit > 0) row.pay++;
            if (ct) { row.cart++; bCart += unit; nCart++; }
          } } } } }
  const mean = sum / combos;
  return {
    combos,
    baseRtp: mean,
    baseSd: Math.sqrt(sum2 / combos - mean * mean),
    hitRate: hits / combos,
    baseWinRate: baseWins / combos,
    lineHitRate: anyLine / combos,
    byScatter: by.map((r) => ({ p: r.n / combos, eB: r.b / combos, eB2: r.b2 / combos, pCart: r.cart / combos, pPay: r.pay / combos })),
    eBCart: bCart / combos,
    pCart: nCart / combos,
  };
}

/** Exact E[pick^2] in (x bet)^2: first prize f uniform, each other prize kept w.p. 1/4, any two w.p. 1/10. */
export function pickSecondMoment(): number {
  const P = [...MINE_PICK_PRIZES];
  const c = MINE_PICK_COLLECTS;
  const p1 = 1 / (c + 1);
  const p2 = (2 * factorial(c)) / factorial(c + 2); // two given prizes both before every collect
  let acc = 0;
  for (let f = 0; f < P.length; f++) {
    const o = P.filter((_, i) => i !== f);
    const so = o.reduce((a, b) => a + b, 0);
    const sq = o.reduce((a, b) => a + b * b, 0);
    acc += P[f]! ** 2 + 2 * P[f]! * so * p1 + sq * p1 + (so * so - sq) * p2;
  }
  return acc / P.length;
}
function factorial(n: number): number { return n <= 1 ? 1 : n * factorial(n - 1); }

/**
 * Exact first and second moments of a free-spins feature for an initial award, by DP over
 * (awarded, remaining, multiplier). Each free spin returns Y = m B (B = base lines + scatter, m = the
 * Lantern Multiplier it started with); its scatter count k drives the retrigger and whether it paid
 * (B > 0) moves m up by one (max 4), using the joint law of (B, k, B > 0) from the enumeration.
 * Also returns pMax = P(at least one free spin in the feature is played at x4).
 */
export function freeSpinMoments(initial: number, en: MineEnumeration): { m1: number; m2: number; pMax: number } {
  const memo = new Map<number, [number, number, number]>();
  const by = en.byScatter;
  const f = (awarded: number, remaining: number, m: number): [number, number, number] => {
    if (remaining <= 0) return [0, 0, 0];
    const key = (awarded * 1000 + remaining) * 10 + m;
    const hit = memo.get(key);
    if (hit) return hit;
    let m1 = 0, m2 = 0, pm = 0;
    const up = Math.min(m + 1, MINE_FS_MULT_MAX);
    for (let k = 0; k <= 5; k++) {
      const add = Math.min(MINE_FS_AWARD[k]!, MINE_FS_CAP - awarded);
      const row = by[k]!;
      const pPay = row.pPay, pNo = row.p - row.pPay;
      const [u1, u2, uM] = f(awarded + add, remaining - 1 + add, up); // after a paying spin
      const [s1, s2, sM] = pNo > 0 ? f(awarded + add, remaining - 1 + add, m) : [0, 0, 0]; // after a blank spin
      const eY = m * row.eB, eY2 = m * m * row.eB2; // B > 0 only on paying spins, so eB / eB2 sit on the paying branch
      m1 += eY + pPay * u1 + pNo * s1;
      m2 += eY2 + 2 * eY * u1 + pPay * u2 + pNo * s2;
      pm += pPay * uM + pNo * sM;
    }
    const v: [number, number, number] = [m1, m2, m >= MINE_FS_MULT_MAX ? 1 : pm]; // this spin itself plays at x4
    memo.set(key, v);
    return v;
  };
  const a = Math.min(initial, MINE_FS_CAP);
  const [m1, m2, pMax] = f(a, a, MINE_FS_MULT_START);
  return { m1, m2, pMax };
}

/** Exact total RTP and SD per unit bet (base + free spins + pick), from the enumeration. */
export function mineExactFull(en: MineEnumeration = mineEnumerate()) {
  const ex = mineExact(en);
  let pMaxW = 0;
  const pick1 = pickExpectedX(), pick2 = pickSecondMoment();
  let eX = en.baseRtp + en.pCart * pick1;
  let eX2 = en.byScatter.reduce((a, r) => a + r.eB2, 0) + en.pCart * pick2 + 2 * en.eBCart * pick1;
  for (let k = 3; k <= 5; k++) {
    const r = en.byScatter[k]!;
    const { m1, m2, pMax } = freeSpinMoments(MINE_FS_AWARD[k]!, en);
    pMaxW += r.p * pMax;
    eX += r.p * m1;
    eX2 += r.p * m2 + 2 * r.eB * m1 + 2 * r.pCart * m1 * pick1;
  }
  return { ...ex, totalRtpEnumerated: eX, sdPerUnit: Math.sqrt(eX2 - eX * eX), hitRate: en.hitRate, baseSd: en.baseSd, baseWinRate: en.baseWinRate,
    /** P(at least one free spin of a feature is played at x4). */
    lanternMaxChance: pMaxW / ex.freeSpinsChance };
}

export const MINE_INFO = {
  name: "Canary Creek Mine",
  reels: 5,
  rows: 3,
  lines: MINE_LINES,
  paytable: MINE_PAYTABLE,
  scatterPay: MINE_SCATTER_PAY,
  freeSpinsAward: MINE_FS_AWARD,
  lanternMultiplier: { start: MINE_FS_MULT_START, max: MINE_FS_MULT_MAX, step: "+1 after every paying free spin" },
  freeSpinsCap: MINE_FS_CAP,
  pickPrizes: MINE_PICK_PRIZES,
  pickCollects: MINE_PICK_COLLECTS,
};
