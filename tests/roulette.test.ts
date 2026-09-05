import { describe, it, expect } from "vitest";
import { settleRoulette, WHEEL } from "../src/lib/games/roulette";

describe("american roulette", () => {
  it("has 38 pockets including 0 and 00", () => {
    expect(WHEEL).toHaveLength(38);
    expect(WHEEL.includes("0")).toBe(true);
    expect(WHEEL.includes("00")).toBe(true);
  });

  it("straight pays 35:1 including stake", () => {
    const r = settleRoulette([{ kind: "straight", numbers: ["17"], amountCents: 100 }], "17");
    expect(r.payoutCents).toBe(3600);
  });

  it("even money loses on 0 and 00", () => {
    const bets = [{ kind: "red" as const, numbers: ["1","3"], amountCents: 100 }];
    expect(settleRoulette(bets, "0").payoutCents).toBe(0);
    expect(settleRoulette(bets, "00").payoutCents).toBe(0);
  });

  it("dozen pays 2:1 including stake", () => {
    const nums = Array.from({ length: 12 }, (_, i) => String(i + 1));
    const r = settleRoulette([{ kind: "dozen", numbers: nums, amountCents: 100 }], "7");
    expect(r.payoutCents).toBe(300);
  });
});


import { FELT_ROWS, pocketColor, RED, BLACK, WHEEL_ORDER, RED_NUMS, BLACK_NUMS } from "../src/lib/games/rouletteFelt";

describe("american felt layout", () => {
  it("has 18 red and 18 black, plus 0 and 00", () => {
    expect(RED_NUMS).toHaveLength(18);
    expect(BLACK_NUMS).toHaveLength(18);
    expect(new Set([...RED_NUMS, ...BLACK_NUMS]).size).toBe(36);
    expect(pocketColor("0")).toBe("green");
    expect(pocketColor("00")).toBe("green");
  });

  it("colors every number 1–36 correctly", () => {
    for (let n = 1; n <= 36; n++) {
      const c = pocketColor(String(n));
      if (RED.has(n)) expect(c).toBe("red");
      else expect(c).toBe("black");
    }
  });

  it("places numbers in three rows with 3/2/1 at the zero end", () => {
    expect(FELT_ROWS[0]![0]).toBe(3);
    expect(FELT_ROWS[1]![0]).toBe(2);
    expect(FELT_ROWS[2]![0]).toBe(1);
    expect(FELT_ROWS[0]![11]).toBe(36);
    expect(FELT_ROWS[1]![11]).toBe(35);
    expect(FELT_ROWS[2]![11]).toBe(34);
    // each street is n, n+1, n+2 from bottom to top
    for (let street = 0; street < 12; street++) {
      const a = FELT_ROWS[2]![street]!;
      const b = FELT_ROWS[1]![street]!;
      const c = FELT_ROWS[0]![street]!;
      expect(b).toBe(a + 1);
      expect(c).toBe(a + 2);
      expect(a % 3).toBe(1);
    }
  });

  it("top row is the 3rd column bet", () => {
    expect(FELT_ROWS[0]).toEqual([3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36]);
  });

  it("wheel order matches American double-zero", () => {
    expect([...WHEEL_ORDER]).toEqual([...WHEEL]);
  });
});

  it("corner pays 8:1 including stake", () => {
    const r = settleRoulette([{ kind: "corner", numbers: ["1","2","4","5"], amountCents: 100 }], "4");
    expect(r.payoutCents).toBe(900);
  });
  it("corner misses if pocket is off the four", () => {
    const r = settleRoulette([{ kind: "corner", numbers: ["1","2","4","5"], amountCents: 100 }], "3");
    expect(r.payoutCents).toBe(0);
  });
