/**
 * Research #5 slice 3: Canary Creek Mine Lantern Multiplier (stacking free-spin multiplier).
 * Server and meter agree spin by spin; the exact DP (RTP, feature pay, P(reach x4)) matches a seeded
 * simulation through runFreeSpins; the published lines come from the frozen math; resume rebuilds the meter.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  runFreeSpins, playMine, publicMineSpin, lanternMultAt, freeSpinMoments, mineEnumerate,
  MINE_FS_AWARD, MINE_FS_MULT_MAX, MINE_FS_MULT_START, MINE_LINES, type Pick,
} from "../src/lib/games/mine";
import { lanternMeter } from "../src/lib/lanternMeter";
import { MINE_MATH, MINE_LANTERN_LINE, gameMath } from "../src/lib/gameMath";
import { mineSummary } from "../src/lib/bonusBookends";

function seeded(seed: number): Pick {
  let s = seed >>> 0 || 1;
  return (n) => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return Math.floor((s / 4294967296) * n); };
}

describe("Lantern Multiplier: server and on-screen meter agree", () => {
  it("every free spin's mult = 1 + earlier paying spins (max 4), win = base x mult, never drops", () => {
    const pick = seeded(99);
    let checked = 0;
    for (let f = 0; f < 3000; f++) {
      const fs = runFreeSpins(25, MINE_FS_AWARD[3]!, pick);
      fs.spins.forEach((s, i) => {
        expect(s.mult).toBe(lanternMultAt(fs.spins, i));
        expect(s.mult).toBe(lanternMeter(fs.spins, i, false).mult);
        expect(s.winCents).toBe(s.baseWinCents * s.mult);
        if (i > 0) expect(s.mult).toBeGreaterThanOrEqual(fs.spins[i - 1]!.mult);
        expect(s.mult).toBeGreaterThanOrEqual(MINE_FS_MULT_START);
        expect(s.mult).toBeLessThanOrEqual(MINE_FS_MULT_MAX);
        checked++;
      });
      expect(fs.totalWinCents).toBe(fs.spins.reduce((a, s) => a + s.winCents, 0));
      expect(fs.maxMult).toBe(Math.max(...fs.spins.map((s) => s.mult)));
    }
    expect(checked).toBeGreaterThan(15000);
  });

  it("meter: 'next' only once a paying spin is on screen and there is room to climb", () => {
    const spins = [{ baseWinCents: 0, winCents: 0 }, { baseWinCents: 50, winCents: 50 }, { baseWinCents: 20, winCents: 40 }, { baseWinCents: 10, winCents: 30 }, { baseWinCents: 5, winCents: 20 }, { baseWinCents: 0, winCents: 0 }];
    expect(lanternMeter(spins, 0, false)).toMatchObject({ mult: 1, next: null, paidShown: 0 });
    expect(lanternMeter(spins, 0, true)).toMatchObject({ mult: 1, next: null, paidShown: 0 }); // blank spin: no climb
    expect(lanternMeter(spins, 1, false)).toMatchObject({ mult: 1, next: null });
    expect(lanternMeter(spins, 1, true)).toMatchObject({ mult: 1, next: 2, paidShown: 1 });
    expect(lanternMeter(spins, 2, false)).toMatchObject({ mult: 2 });
    expect(lanternMeter(spins, 3, true)).toMatchObject({ mult: 3, next: 4 });
    expect(lanternMeter(spins, 4, true)).toMatchObject({ mult: 4, next: null }); // at the cap
    expect(lanternMeter(spins, 5, false)).toMatchObject({ mult: 4, next: null, paidShown: 4 });
    expect(lanternMeter(spins, 1, true).label).toBe("Lantern Multiplier ×1 of ×4. 1 paying free spin shown so far. Next spin pays ×2.");
  });

  it("a resumed round (saved step) rebuilds the same meter: it depends only on spins before the step", () => {
    const pick = seeded(5);
    let s = publicMineSpin(playMine(25, pick));
    while (!s.freeSpins || s.freeSpins.spins.length < 6) s = publicMineSpin(playMine(25, pick));
    const fs = JSON.parse(JSON.stringify(s.freeSpins)) as typeof s.freeSpins; // what GET ?resume=1 returns
    for (let step = 0; step < fs!.spins.length; step++) {
      expect(lanternMeter(fs!.spins, step, false).mult).toBe(s.freeSpins!.spins[step]!.mult);
    }
  });

  it("feature summary names the highest Lantern the block paid at", () => {
    const pick = seeded(8);
    let s = publicMineSpin(playMine(25, pick));
    while (!s.freeSpins) s = publicMineSpin(playMine(25, pick));
    const row = mineSummary(s, 100).rows.find((r) => r.label.startsWith("Free spins"))!;
    expect(row.label).toContain(`Lantern up to ×${s.freeSpins.maxMult}`);
  });
});

describe("Lantern Multiplier: exact math vs simulation", () => {
  const en = mineEnumerate();
  it("exact feature mean and P(reach x4) match a seeded simulation for every award", () => {
    for (const k of [3, 4, 5]) {
      const award = MINE_FS_AWARD[k]!;
      const ex = freeSpinMoments(award, en);
      const pick = seeded(1000 + k);
      const N = 40000;
      let sum = 0, reach = 0;
      for (let i = 0; i < N; i++) {
        const fs = runFreeSpins(100, award, pick);
        sum += fs.totalWinCents / (100 * MINE_LINES);
        if (fs.maxMult === MINE_FS_MULT_MAX) reach++;
      }
      const sd = Math.sqrt(ex.m2 - ex.m1 * ex.m1);
      expect(Math.abs(sum / N - ex.m1)).toBeLessThan(4 * sd / Math.sqrt(N));
      expect(Math.abs(reach / N - ex.pMax)).toBeLessThan(0.012);
    }
  }, 120000);
  it("published Lantern odds come from the frozen exact figures", () => {
    expect(MINE_MATH.lanternMaxChance).toBeCloseTo(0.572841, 6);
    expect(MINE_LANTERN_LINE).toBe("Lantern Multiplier ×1–×4: +1 after every paying free spin · a free-spins feature averages 13.2× bet · plays at ×4 in 57% of features");
    expect(MINE_MATH.rtp).toBeGreaterThan(0.88);
    expect(MINE_MATH.rtp).toBeLessThan(0.96);
    expect(gameMath("mine").volatility).toBe("Medium");
  });
});

describe("Lantern Multiplier: page wiring", () => {
  const page = readFileSync("src/app/mine/page.tsx", "utf8");
  it("shows the meter from lanternMeter (screen state only), the published odds line and the rules text", () => {
    expect(page).toMatch(/lanternMeter\(spin\.freeSpins\.spins/);
    expect(page).toMatch(/data-testid="lantern-meter"/);
    expect(page).toMatch(/\{MINE_LANTERN_LINE\}/);
    expect(page).toMatch(/Lantern Multiplier<\/b>: it starts at/);
    expect(page).not.toMatch(/FREE SPINS ×2|every free-spin win is doubled|Math\.random/);
    expect(readFileSync("src/app/rules/page.tsx", "utf8")).toMatch(/lanternMaxChance/);
  });
});
