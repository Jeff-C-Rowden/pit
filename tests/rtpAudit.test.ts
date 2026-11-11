/**
 * RTP locks from the RTP audit (RTP_AUDIT.md). Every figure is exact: slots enumerate all
 * stop tuples, the progressive is solved in closed form, roulette enumerates 38 pockets and
 * craps value-iterates the real resolveRoll over all 36 dice outcomes. Tolerance ±0.3 pts.
 */
import { describe, it, expect } from "vitest";
import { sundownTrailExact, antlerRidgeLineExact, antlerRidgeTotalExact, antlerRidgeProgressiveExact } from "../src/lib/games/rtpMath";
import { splitContributionUnbiased, VS_TIERS } from "../src/lib/games/slotProgressive";
import { WHEEL, settleRoulette, validateBet, dozen, column, type RouletteBet } from "../src/lib/games/roulette";
import { newCrapsTable, applyBet, resolveRoll, type CrapsState } from "../src/lib/games/craps";
import { startHoldem, playerAct } from "../src/lib/games/holdem";
import { CAB_COIN_STEPS } from "../src/lib/cabinet";

const TOL = 0.003;

describe("slot RTP locks (exact enumeration)", () => {
  it("Sundown Trail is 95.53% (inside the published 94-96%)", () => {
    const r = sundownTrailExact();
    expect(Math.abs(r.rtp - 0.9553)).toBeLessThanOrEqual(TOL);
    expect(r.rtp).toBeGreaterThanOrEqual(0.94);
    expect(r.rtp).toBeLessThanOrEqual(0.96);
  });

  const line = antlerRidgeLineExact();
  it("Antler Ridge base game is 89.22% (line pays only)", () => {
    expect(Math.abs(line.rtp - 0.8922)).toBeLessThanOrEqual(TOL);
  });

  it("Antler Ridge total RTP is 95.0% ± 0.3 at every cabinet coin step", () => {
    for (const coin of CAB_COIN_STEPS) {
      const t = antlerRidgeTotalExact(coin, line);
      expect(Math.abs(t.totalRtp - 0.95), `coin ${coin}: ${t.totalRtp}`).toBeLessThanOrEqual(TOL);
      expect(Math.abs(t.contribution - 0.03)).toBeLessThan(1e-9); // exactly the published 3.00%
    }
  });

  it("Grand seed funding no longer depends on bet size (chance scales with the bet)", () => {
    const g = (c: number) => antlerRidgeProgressiveExact(c).tiers.find((t) => t.tier === "Grand")!.returnPct;
    expect(Math.abs(g(25) - g(5000))).toBeLessThan(1e-9);
  });

  it("unbiased contribution split averages exactly the published bps", () => {
    for (const bet of [225, 450, 2250]) {
      // enumerate the pick() outcomes exactly: each tier's +1 happens for `rem` of 10,000 picks
      for (const t of VS_TIERS) {
        let total = 0;
        for (let k = 0; k < 10_000; k++) total += splitContributionUnbiased(bet, () => k)[t.id];
        expect(total / 10_000).toBeCloseTo((bet * t.contributionBps) / 10_000, 9);
      }
    }
  });
});

describe("American roulette: every offered bet is 5.26%", () => {
  it("enumerates all 38 pockets per bet type; five-number bet stays off", () => {
    const mk = (kind: RouletteBet["kind"], numbers: string[]): RouletteBet => ({ kind, numbers, amountCents: 100 });
    const bets = [mk("straight", ["00"]), mk("split", ["17", "20"]), mk("street", ["1", "2", "3"]), mk("corner", ["1", "2", "4", "5"]),
      mk("six", ["1", "2", "3", "4", "5", "6"]), mk("dozen", dozen(3)), mk("column", column(1)), mk("red", []), mk("black", []),
      mk("even", []), mk("odd", []), mk("low", []), mk("high", [])];
    for (const b of bets) {
      validateBet(b);
      let ret = 0; for (const p of WHEEL) ret += settleRoulette([b], p).payoutCents;
      expect(ret / (38 * 100)).toBeCloseTo(36 / 38, 12);
    }
    expect(() => validateBet(mk("five", ["0", "00", "1", "2", "3"]))).toThrow();
  });
});

// ---- craps: exact value iteration over the real resolveRoll ----
const DICE: [number, number][] = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) DICE.push([a, b]);
const clone = (s: CrapsState): CrapsState => JSON.parse(JSON.stringify(s));
const key = (s: CrapsState) => JSON.stringify([s.point, s.pass, s.dontPass, s.place, s.come, s.dontCome]);
function decisionEV(start: CrapsState, done: (s: CrapsState, pay: number) => boolean, left: (s: CrapsState) => number) {
  const trans = new Map<string, { imm: number; next: string | null }[]>();
  const queue = [start]; const seen = new Set([key(start)]);
  while (queue.length) {
    const s = queue.pop()!; const t: { imm: number; next: string | null }[] = [];
    for (const d of DICE) {
      const n = clone(s); n.log = []; const r = resolveRoll(n, d);
      if (done(n, r.payoutCents)) t.push({ imm: r.payoutCents + left(n), next: null });
      else { const k = key(n); t.push({ imm: r.payoutCents, next: k }); if (!seen.has(k)) { seen.add(k); queue.push(n); } }
    }
    trans.set(key(s), t);
  }
  const V = new Map<string, number>([...trans.keys()].map((k) => [k, 0]));
  for (let it = 0; it < 3000; it++) for (const [k, t] of trans) V.set(k, t.reduce((a, x) => a + (x.imm + (x.next ? V.get(x.next)! : 0)) / 36, 0));
  return V.get(key(start))!;
}
const table = (point: number | null) => { const s = newCrapsTable(); s.point = point; return s; };

describe("craps edges (exact, real resolveRoll)", () => {
  const U = 600;
  it("pass 1.41%, don't pass 1.40% (12 barred, pushes re-bet)", () => {
    const p = table(null); applyBet(p, { type: "pass", amount: U });
    expect(1 - decisionEV(p, (n, x) => n.pass === 0 || x > 0, (n) => n.pass) / U).toBeCloseTo(7 / 495, 6);
    const d = table(null); applyBet(d, { type: "dontPass", amount: U });
    expect(1 - decisionEV(d, (n, x) => n.dontPass === 0 || x > 0, (n) => n.dontPass) / U).toBeCloseTo(27 / 1925, 6) /* per resolved bet; 1.36% if bar-12 pushes count */;
  });

  it("come and don't come match pass / don't pass whatever the point is (was 48% / -47%)", () => {
    for (const pt of [4, 5, 6, 8, 9, 10]) {
      const c = table(pt); applyBet(c, { type: "come", amount: U });
      expect(1 - decisionEV(c, (n, x) => n.come.length === 0 || x > 0, () => 0) / U, `come, point ${pt}`).toBeCloseTo(7 / 495, 6);
      const dc = table(pt); applyBet(dc, { type: "dontCome", amount: U });
      expect(1 - decisionEV(dc, (n, x) => n.dontCome.length === 0 || x > 0, () => 0) / U, `don't come, point ${pt}`).toBeCloseTo(27 / 1925, 6) /* per resolved bet; 1.36% if bar-12 pushes count */;
    }
  });

  it("a come bet on 5 wins when 5 rolls even though the point is 6", () => {
    const s = table(6); applyBet(s, { type: "come", amount: U });
    resolveRoll(s, [2, 3]);
    expect(s.come[0]!.point).toBe(5);
    const r = resolveRoll(s, [1, 4]);
    expect(r.payoutCents).toBe(2 * U);
    expect(s.come).toHaveLength(0);
  });

  it("place 6/8 1.52%, field 2.78%", () => {
    const s = table(6); applyBet(s, { type: "place", number: 6, amount: U });
    expect(1 - decisionEV(s, (n, x) => n.place["6"] === 0 || x > 0, (n) => n.place["6"]) / U).toBeCloseTo(1 / 66, 6);
    const f = table(null); applyBet(f, { type: "field", amount: U });
    let ev = 0; for (const d of DICE) ev += resolveRoll(clone(f), d).payoutCents / 36;
    expect(1 - ev / U).toBeCloseTo(1 / 36, 9);
  });
});

describe("hold'em: house folding its small blind settles the hand", () => {
  it("never leaves a dealt hand open with nobody to act", () => {
    let folds = 0;
    for (let i = 0; i < 3000; i++) {
      const { state } = startHoldem(false);
      if (state.houseFolded) {
        folds++;
        expect(state.street).toBe("folded");
        expect(state.winner).toBe("player");
        expect(state.payoutCents).toBe(state.pot);
      } else expect(state.toAct).not.toBe("none");
    }
    expect(folds).toBeGreaterThan(0);
  });
});

describe("hold'em: a call closes the betting", () => {
  it("first actor calling a bet ends the street instead of reopening it for a house re-raise", () => {
    for (let i = 0; i < 50; i++) {
      const { state: s } = startHoldem(false); // player is first to act after the flop
      if (s.street === "folded") continue;
      while (s.board.length < 5) s.board.push(s.deck.pop()!);
      Object.assign(s, { street: "river", toAct: "player", currentBet: 600, houseBet: 600, playerBet: 0, lastRaise: 600, pot: 1400 });
      playerAct(s, { type: "call" });
      expect(s.street).toBe("showdown");
      expect(s.log.at(-1)).toBe("You call 600."); // the house never acts after the closing call
      return;
    }
    throw new Error("no dealt hand");
  });
});
