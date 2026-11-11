import { describe, it, expect } from "vitest";
import {
  BB_REELS, BB_PAYS, BB_ANY_BAR, BB_CHERRY, BB_TOP, BB_DENOMS, buckshotInfo, evaluateBuckshot, exactBuckshotRtp, spinBuckshot, validateBuckshotBet, windowFor, type BbSymbol,
} from "@/lib/games/buckshot";

/** Independent RTP: counts every combination with a hand-written pay rule, not the engine's evaluator. */
function independentRtp(coins: number) {
  const bars = ["BAR1", "BAR2", "BAR3"];
  let total = 0, n = 0;
  for (const a of BB_REELS[0]!) for (const b of BB_REELS[1]!) for (const c of BB_REELS[2]!) {
    n++;
    const line = [a, b, c];
    const w = line.filter((s) => s === "WILD").length;
    if (w === 3) { total += BB_TOP[coins]!; continue; }
    const r = line.filter((s) => s !== "WILD");
    const cands = [0];
    if (!r.includes("BLANK")) {
      if (r.every((s) => s === r[0]) && r[0]! in BB_PAYS) cands.push((BB_PAYS as Record<string, number>)[r[0]!]!);
      if (r.every((s) => bars.includes(s))) cands.push(BB_ANY_BAR);
    }
    const ch = r.filter((s) => s === "CHERRY").length;
    if (ch) cands.push(BB_CHERRY[Math.min(3, ch + w)]!);
    total += Math.max(...cands) * 2 ** w * coins;
  }
  return total / (n * coins);
}

describe("Buckshot Bars: strips and window", () => {
  it("each strip alternates symbol and blank, one wild per reel", () => {
    for (const strip of BB_REELS) {
      strip.forEach((s, i) => expect(s === "BLANK").toBe(i % 2 === 1));
      expect(strip.filter((s) => s === "WILD")).toHaveLength(1);
    }
    expect(BB_REELS.map((r) => r.length)).toEqual([24, 24, 26]);
  });
  it("the window shows the real strip neighbours (no near-miss staging)", () => {
    const w = windowFor([0, 5, 25]);
    expect(w[0]).toEqual([BB_REELS[0]![23], BB_REELS[0]![0], BB_REELS[0]![1]]);
    expect(w[1]).toEqual([BB_REELS[1]![4], BB_REELS[1]![5], BB_REELS[1]![6]]);
    expect(w[2]).toEqual([BB_REELS[2]![24], BB_REELS[2]![25], BB_REELS[2]![0]]);
  });
  it("draws exactly one uniform stop per reel and pays only the payline", () => {
    const calls: number[] = [];
    const s = spinBuckshot(3, 100, (n) => { calls.push(n); return 0; });
    expect(calls).toEqual([24, 24, 26]);
    expect(s.line).toEqual(["BAR1", "BAR2", "BAR1"]);
    expect(s.kind).toBe("ANY BARS");
    expect(s.winCents).toBe(BB_ANY_BAR * 3 * 100);
    expect(s.betCents).toBe(300);
  });
});

describe("Buckshot Bars: pays", () => {
  const ev = (l: string, coins = 1) => evaluateBuckshot(l.split(" ") as BbSymbol[], coins);
  it("three wilds pay the top award with the 3-coin jump", () => {
    expect([1, 2, 3].map((c) => ev("WILD WILD WILD", c).pay)).toEqual([800, 1600, 2500]);
  });
  it("wild substitutes and doubles once per wild", () => {
    expect(ev("SEVEN SEVEN SEVEN").pay).toBe(80);
    expect(ev("SEVEN WILD SEVEN").pay).toBe(160);
    expect(ev("WILD SEVEN WILD").pay).toBe(320);
    expect(ev("BAR1 WILD BAR3").pay).toBe(BB_ANY_BAR * 2);
  });
  it("cherries pay anywhere, blanks break everything else", () => {
    expect(ev("CHERRY BLANK BLANK").pay).toBe(1);
    expect(ev("BLANK CHERRY CHERRY").pay).toBe(3);
    expect(ev("CHERRY CHERRY CHERRY", 2).pay).toBe(20);
    expect(ev("BAR1 BAR1 BLANK").pay).toBe(0);
    expect(ev("SEVEN SEVEN BAR1").pay).toBe(0);
  });
  it("coin value and coin count are validated", () => {
    expect(() => validateBuckshotBet(0, 100)).toThrow();
    expect(() => validateBuckshotBet(4, 100)).toThrow();
    expect(() => validateBuckshotBet(1, 30)).toThrow();
    expect(validateBuckshotBet(2, 500)).toEqual({ coins: 2, denomCents: 500, betCents: 1000 });
    expect(BB_DENOMS[0]).toBe(25);
  });
});

describe("Buckshot Bars: published RTP is exact", () => {
  it("matches an independent enumeration for 1, 2 and 3 coins", () => {
    for (const c of [1, 2, 3]) expect(exactBuckshotRtp(c).rtp).toBeCloseTo(independentRtp(c), 12);
  });
  it("is 94.44% at 1–2 coins and 94.67% at 3 coins", () => {
    const r1 = exactBuckshotRtp(1), r3 = exactBuckshotRtp(3);
    expect(r1.combos).toBe(24 * 24 * 26);
    expect(r1.totalPay).toBe(14144);
    expect((r1.rtp * 100).toFixed(2)).toBe("94.44");
    expect((r3.rtp * 100).toFixed(2)).toBe("94.67");
    expect(exactBuckshotRtp(2).rtp).toBe(r1.rtp);
    const info = buckshotInfo();
    expect(info.rtpPublished).toContain("94.44%");
    expect(info.rtpPublished).toContain("94.67%");
  });
});
