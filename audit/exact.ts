/**
 * Exact (enumerated / closed-form / value-iterated) RTP from the real server game code.
 * Run: node audit/build.mjs audit/exact.ts /tmp/exact.mjs && node /tmp/exact.mjs
 */
import { REELS, evaluateGrid, LINE_COUNT, PAYTABLE } from "../src/lib/games/slot";
import { VS_REELS, evaluateVsGrid, VS_LINE_COUNT, VS_TIERS, splitContribution, VS_MIN_COIN_CENTS } from "../src/lib/games/slotProgressive";
import { WHEEL, settleRoulette, RED, BLACK, dozen, column, type RouletteBet, validateBet } from "../src/lib/games/roulette";
import { newCrapsTable, applyBet, resolveRoll, type CrapsState, type PlaceAction } from "../src/lib/games/craps";
import { BB_REELS, evaluateBuckshot } from "./snapshots/games/buckshot";

type Stats = { rtp: number; sd: number; hit: number; maxPay: number };

/** Enumerate every stop tuple of a 5x3 strip set; pay in credits per 1-credit coin. */
export function enumerate5(reels: string[][], evalGrid: (g: any) => number, lines: number): Stats {
  const n = reels.map((r) => r.length);
  const windows = reels.map((strip) => strip.map((_, stop) => [0, 1, 2].map((row) => strip[(stop + row) % strip.length]!)));
  let sum = 0, sum2 = 0, hits = 0, combos = 0, maxPay = 0;
  const g: string[][] = [[], [], [], [], []];
  for (let a = 0; a < n[0]!; a++) { g[0] = windows[0]![a]!;
    for (let b = 0; b < n[1]!; b++) { g[1] = windows[1]![b]!;
      for (let c = 0; c < n[2]!; c++) { g[2] = windows[2]![c]!;
        for (let d = 0; d < n[3]!; d++) { g[3] = windows[3]![d]!;
          for (let e = 0; e < n[4]!; e++) { g[4] = windows[4]![e]!;
            const p = evalGrid(g);
            sum += p; sum2 += p * p; combos++; if (p > 0) hits++; if (p > maxPay) maxPay = p;
          } } } } }
  const mean = sum / combos / lines;
  const varr = sum2 / combos / (lines * lines) - mean * mean;
  return { rtp: mean, sd: Math.sqrt(varr), hit: hits / combos, maxPay: maxPay / lines };
}

export function gildedExact(reels = REELS as unknown as string[][]) {
  return enumerate5(reels, (g) => evaluateGrid(g as any, 1).winCents, LINE_COUNT);
}
export function canopyLineExact(reels = VS_REELS as unknown as string[][]) {
  return enumerate5(reels, (g) => evaluateVsGrid(g as any, 1).lineWinCents, VS_LINE_COUNT);
}

/**
 * Long-run progressive return per coin-in for a homogeneous bet size (renewal-reward).
 * MHB tier: meter starts at seed S, hidden trigger T ~ U{S..C}; k cents added per spin;
 * hit on the first spin with S + n k >= T (n >= 1); award = S + n k.
 * Grand: hit prob p per spin; award = S + n g with n ~ Geometric(p).
 * Return = E[award] / (E[spins per cycle] * bet). Seed funding = S / (E[spins] * bet).
 */
export function progressiveExact(coinCents: number) {
  const bet = coinCents * VS_LINE_COUNT;
  const contrib = splitContribution(bet);
  const tiers = VS_TIERS.map((t) => {
    const k = contrib[t.id];
    if (t.ceilingCents != null) {
      const S = t.seedCents, C = t.ceilingCents;
      let eN = 0, eA = 0; const cnt = C - S + 1;
      for (let T = S; T <= C; T++) {
        const nSp = Math.max(1, Math.ceil((T - S) / k));
        eN += nSp / cnt; eA += (S + nSp * k) / cnt;
      }
      return { tier: t.name, contribCents: k, contribPct: k / bet, returnPct: eA / (eN * bet), seedPct: S / (eN * bet), spinsPerHit: eN, avgAwardCents: eA };
    }
    const p = 1 / t.mysteryOddsPerSpin!;
    const eN = 1 / p; const eA = t.seedCents + eN * k;
    return { tier: t.name, contribCents: k, contribPct: k / bet, returnPct: eA / (eN * bet), seedPct: t.seedCents / (eN * bet), spinsPerHit: eN, avgAwardCents: eA };
  });
  const total = tiers.reduce((a, t) => a + t.returnPct, 0);
  const contribTotal = tiers.reduce((a, t) => a + t.contribPct, 0);
  const seedTotal = tiers.reduce((a, t) => a + t.seedPct, 0);
  return { coinCents, betCents: bet, tiers, progressiveReturn: total, contribution: contribTotal, seedFunding: seedTotal };
}

export function rouletteExact() {
  const mk = (kind: RouletteBet["kind"], numbers: string[]): RouletteBet => ({ kind, numbers, amountCents: 100 });
  const bets: RouletteBet[] = [
    mk("straight", ["17"]), mk("straight", ["0"]), mk("straight", ["00"]),
    mk("split", ["17", "20"]), mk("street", ["1", "2", "3"]), mk("corner", ["1", "2", "4", "5"]),
    mk("six", ["1", "2", "3", "4", "5", "6"]), mk("dozen", dozen(1)), mk("column", column(2)),
    mk("red", []), mk("black", []), mk("even", []), mk("odd", []), mk("low", []), mk("high", []),
  ];
  let fiveOffered = true;
  try { validateBet(mk("five", ["0", "00", "1", "2", "3"])); } catch { fiveOffered = false; }
  return { fiveOffered, rows: bets.map((b) => {
    validateBet(b);
    let ret = 0;
    for (const p of WHEEL) ret += settleRoulette([b], p).payoutCents;
    return { kind: b.kind, rtp: ret / (WHEEL.length * b.amountCents) };
  }) };
}

// ---------- craps: exact value iteration over the real resolveRoll ----------
const DICE: [number, number][] = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) DICE.push([a, b]);

function clone(s: CrapsState): CrapsState { return JSON.parse(JSON.stringify(s)); }

/**
 * Expected total return of one bet decision, computed with resolveRoll on every one of the
 * 36 dice outcomes, recursing until `done(after, pay)` says the decision closed.
 * `left(after)` = stake still on the felt that belongs to the player at resolution.
 * Value iteration: V(key) = sum p (pay + (done ? left : V(next))). Converges geometrically.
 */
function crapsDecision(start: CrapsState, key: (s: CrapsState) => string,
  done: (s: CrapsState, pay: number) => boolean, left: (s: CrapsState) => number,
  f: (totalReturn: number) => number = (x) => x) {
  const states = new Map<string, CrapsState>();
  const trans = new Map<string, { imm: number; next: string | null }[]>();
  const queue = [start]; states.set(key(start), start);
  while (queue.length) {
    const s = queue.pop()!; const k = key(s); const t: { imm: number; next: string | null }[] = [];
    for (const d of DICE) {
      const n = clone(s); const r = resolveRoll(n, d);
      if (done(n, r.payoutCents)) t.push({ imm: f(r.payoutCents + left(n)), next: null });
      else { if (r.payoutCents !== 0) throw new Error("payout before decision closed"); const nk = key(n); t.push({ imm: 0, next: nk }); if (!states.has(nk)) { states.set(nk, n); queue.push(n); } }
    }
    trans.set(k, t);
  }
  const V = new Map<string, number>(); for (const k of states.keys()) V.set(k, 0);
  for (let it = 0; it < 4000; it++) {
    let delta = 0;
    for (const [k, t] of trans) {
      let v = 0; for (const x of t) v += (x.imm + (x.next ? V.get(x.next)! : 0)) / 36;
      delta = Math.max(delta, Math.abs(v - V.get(k)!)); V.set(k, v);
    }
    if (delta < 1e-12) break;
  }
  return V.get(key(start))!;
}

const K = (s: CrapsState) => JSON.stringify([s.point, s.pass, s.passOdds, s.dontPass, s.dontPassOdds, s.place, s.hard, s.come, s.dontCome, s.field]);

function withPoint(point: number | null, setup: (s: CrapsState) => void) {
  const s = newCrapsTable(); s.point = point; setup(s); s.log = []; return s;
}

/** Win probability and SD of return per unit bet for the main single-decision craps bets. */
export function crapsMoments(unit = 600) {
  const PROB: Record<number, number> = { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 };
  const res: { bet: string; winProb: number; sd: number }[] = [];
  const mom = (bet: string, mk: () => CrapsState, done: (n: CrapsState, p: number) => boolean, left: (n: CrapsState) => number) => {
    const m1 = crapsDecision(mk(), K, done, left, (x) => x / unit);
    const m2 = crapsDecision(mk(), K, done, left, (x) => (x / unit) ** 2);
    const pw = crapsDecision(mk(), K, done, left, (x) => (x > unit ? 1 : 0));
    res.push({ bet, winProb: pw, sd: Math.sqrt(m2 - m1 * m1) });
  };
  mom("Pass line", () => withPoint(null, (x) => { applyBet(x, { type: "pass", amount: unit }); }), (n, p) => n.pass === 0 || p > 0, (n) => n.pass);
  mom("Don't pass", () => withPoint(null, (x) => { applyBet(x, { type: "dontPass", amount: unit }); }), (n, p) => n.dontPass === 0 || p > 0, (n) => n.dontPass);
  mom("Place 6", () => withPoint(6, (x) => { applyBet(x, { type: "place", number: 6, amount: unit }); }), (z, p) => z.place["6"] === 0 || p > 0, (z) => z.place["6"]);
  mom("Come (point 6 on)", () => withPoint(6, (x) => { applyBet(x, { type: "come", amount: unit }); }), (z, p) => z.come.length === 0 || p > 0, () => 0);
  for (const t of ["field", "anySeven", "yo"] as const) {
    const s0 = withPoint(null, (x) => { applyBet(x, { type: t, amount: unit } as PlaceAction); });
    let m1 = 0, m2 = 0, pw = 0; for (const d of DICE) { const r = resolveRoll(clone(s0), d).payoutCents / unit; m1 += r / 36; m2 += r * r / 36; if (r > 1) pw += 1 / 36; }
    res.push({ bet: t, winProb: pw, sd: Math.sqrt(m2 - m1 * m1) });
  }
  { const s0 = withPoint(8, (x) => { applyBet(x, { type: "hard", number: 6, amount: unit }); });
    const d = (z: CrapsState, p: number) => z.hard["6"] === 0 || p > 0;
    const m1 = crapsDecision(s0, K, d, () => 0, (x) => x / unit), m2 = crapsDecision(s0, K, d, () => 0, (x) => (x / unit) ** 2), pw = crapsDecision(s0, K, d, () => 0, (x) => (x > unit ? 1 : 0));
    res.push({ bet: "Hard 6", winProb: pw, sd: Math.sqrt(m2 - m1 * m1) }); }
  void PROB;
  return res;
}

export function rouletteMoments() {
  return [1, 2, 3, 4, 6, 12, 18].map((k) => { const pay = 36 / k; const p = k / 38; const m1 = p * pay, m2 = p * pay * pay; return { numbers: k, hit: p, sd: Math.sqrt(m2 - m1 * m1) }; });
}

export function crapsExact(unit = 600) {
  const rows: { bet: string; rtp: number; note?: string }[] = [];
  const PROB: Record<number, number> = { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 };
  const push = (bet: string, ev: number, stake: number, note?: string) => rows.push({ bet, rtp: ev / stake, note });

  // Pass / don't pass from the come-out
  { const s = withPoint(null, (x) => { applyBet(x, { type: "pass", amount: unit }); });
    push("Pass line", crapsDecision(s, K, (n, p) => n.pass === 0 || p > 0, (n) => n.pass), unit); }
  { const s = withPoint(null, (x) => { applyBet(x, { type: "dontPass", amount: unit }); });
    push("Don't pass (12 push re-bets)", crapsDecision(s, K, (n, p) => n.dontPass === 0 || p > 0, (n) => n.dontPass), unit); }
  // Odds behind a point (isolated: pass flat excluded by subtracting the flat's EV given the point)
  for (const pt of [4, 5, 6]) {
    for (const [type, flat] of [["passOdds", "pass"], ["dontPassOdds", "dontPass"]] as const) {
      const mkS = (odds: number) => withPoint(pt, (x) => { (x as any)[flat] = unit; (x as any)[type] = odds; });
      const doneF = (n: CrapsState, p: number) => n.point === null || p > 0 || (n as any)[flat] === 0;
      const leftF = (n: CrapsState) => (n as any)[flat];
      const both = crapsDecision(mkS(unit), K, doneF, leftF);
      const flatOnly = crapsDecision(mkS(0), K, doneF, leftF);
      push(`${type === "passOdds" ? "Pass odds" : "Don't pass lay odds"} on ${pt}/${14 - pt}`, both - flatOnly, unit);
    }
  }
  // Place bets: working only with a point on; a decision = win once or lose to 7.
  for (const n of [4, 5, 6, 8, 9, 10] as const) {
    const avg = [4, 5, 6, 8, 9, 10].reduce((acc, pt) => {
      const s = withPoint(pt, (x) => { applyBet(x, { type: "place", number: n, amount: unit }); });
      return acc + (PROB[pt]! / 24) * crapsDecision(s, K, (z, p) => z.place[String(n)] === 0 || p > 0, (z) => z.place[String(n)]);
    }, 0);
    push(`Place ${n}`, avg, unit, "bet placed with a point on");
  }
  // One-roll bets
  for (const t of ["field", "anySeven", "anyCraps", "yo"] as const) {
    const s = withPoint(null, (x) => { applyBet(x, { type: t, amount: unit } as PlaceAction); });
    let ev = 0; for (const d of DICE) ev += resolveRoll(clone(s), d).payoutCents / 36;
    push({ field: "Field (2 pays 2:1, 12 pays 3:1)", anySeven: "Any seven", anyCraps: "Any craps", yo: "Yo (11)" }[t], ev, unit);
  }
  for (const n of [4, 6] as const) {
    const s = withPoint(6 === n ? 8 : 5, (x) => { applyBet(x, { type: "hard", number: n, amount: unit }); });
    push(`Hard ${n}/${14 - n}`, crapsDecision(s, K, (z, p) => z.hard[String(n)] === 0 || p > 0, () => 0), unit);
  }
  // Come / don't come, placed with each point on (weighted by point frequency)
  for (const [type, arr] of [["come", "come"], ["dontCome", "dontCome"]] as const) {
    const per: string[] = []; let avg = 0;
    for (const pt of [4, 5, 6, 8, 9, 10]) {
      const s = withPoint(pt, (x) => { applyBet(x, { type, amount: unit }); });
      const ev = crapsDecision(s, K, (z, p) => (z as any)[arr].length === 0 || p > 0, () => 0);
      per.push(`${pt}:${(100 * (1 - ev / unit)).toFixed(3)}%`); avg += (PROB[pt]! / 24) * ev;
    }
    push(type === "come" ? "Come" : "Don't come", avg, unit, `edge by point on: ${per.join(" ")}`);
  }
  return rows;
}

export function buckshotExact(coins: number, reels = BB_REELS as unknown as string[][]) {
  let sum = 0, sum2 = 0, hits = 0, combos = 0;
  for (const x of reels[0]!) for (const y of reels[1]!) for (const z of reels[2]!) {
    const p = evaluateBuckshot([x, y, z] as any, coins).pay; sum += p; sum2 += p * p; combos++; if (p > 0) hits++;
  }
  const mean = sum / combos / coins;
  return { rtp: mean, sd: Math.sqrt(sum2 / combos / (coins * coins) - mean * mean), hit: hits / combos, combos };
}

if (process.argv[1]?.endsWith("exact.mjs") || process.argv[1]?.endsWith("exact-after.mjs")) {
  const pct = (x: number) => (100 * x).toFixed(4) + "%";
  const out: any = {};
  out.gilded = gildedExact(); console.log("Gilded Track", out.gilded);
  out.canopyLine = canopyLineExact(); console.log("Canopy Spire line", out.canopyLine);
  out.progressive = [25, 50, 100, 500, 5000].map(progressiveExact);
  for (const p of out.progressive) console.log("prog coin", p.coinCents, "return", pct(p.progressiveReturn), "contrib", pct(p.contribution), "seed", pct(p.seedFunding), p.tiers.map((t: any) => `${t.tier}:${pct(t.returnPct)} (k=${t.contribCents}, 1/${t.spinsPerHit.toFixed(0)})`).join(" "));
  out.roulette = rouletteExact(); console.log("roulette", JSON.stringify(out.roulette));
  out.craps = crapsExact(); for (const r of out.craps) console.log("craps", r.bet, pct(r.rtp), "edge", pct(1 - r.rtp), r.note ?? "");
  out.crapsSmall = crapsExact(25); for (const r of out.crapsSmall) console.log("craps $0.25", r.bet, "edge", pct(1 - r.rtp));
  out.crapsMoments = crapsMoments(); console.log("craps moments", out.crapsMoments);
  out.rouletteMoments = rouletteMoments(); console.log("roulette moments", out.rouletteMoments);
  out.buckshot = [1, 2, 3].map((c) => ({ coins: c, ...buckshotExact(c) })); console.log("buckshot", out.buckshot);
  (await import("fs")).writeFileSync(process.env.OUT ?? "/tmp/exact.json", JSON.stringify(out, null, 1));
}
