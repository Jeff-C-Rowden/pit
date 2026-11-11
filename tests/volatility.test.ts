import { describe, it, expect } from "vitest";
import { sundownTrailExact, antlerRidgeLineExact, antlerRidgeTotalExact } from "../src/lib/games/rtpMath";
import { exactBuckshotRtp } from "../src/lib/games/buckshot";
import { VS_REELS, VS_DISPLAY_PAYTABLE, VS_PAYTABLE } from "../src/lib/games/slotProgressive";
import {
  ANTLER_MATH, BUCKSHOT_MATH, SUNDOWN_MATH, TABLE_MATH,
  filterByVolatility, gameMath, oneRollSd, volBucket, winsAbout,
  ROULETTE_BET_MATH,
} from "../src/lib/gameMath";

describe("volatility buckets (SD per $1)", () => {
  it("is Low under 3, Medium through 8, High above 8", () => {
    expect(volBucket(1.77)).toBe("Low");
    expect(volBucket(2.99)).toBe("Low");
    expect(volBucket(3)).toBe("Medium");
    expect(volBucket(3.58)).toBe("Medium");
    expect(volBucket(8)).toBe("Medium");
    expect(volBucket(8.01)).toBe("High");
    expect(volBucket(9.99)).toBe("High");
  });
  it("does not imply a win is due", () => {
    expect(winsAbout(0.3056)).toBe("wins about 1 in 3 spins");
    expect(winsAbout(ANTLER_MATH.winRate)).toBe("wins about 1 in 4 spins");
    expect(winsAbout(BUCKSHOT_MATH.winRate)).toBe("wins about 1 in 11 spins");
    expect(gameMath("slot").line).not.toMatch(/due|hot|overdue|due for/i);
    expect(gameMath("vault").tip).not.toMatch(/due|hot|overdue/i);
  });
});

describe("published slot math matches the server paytables", () => {
  it("Sundown Trail is 95.53% Low, wins about 1 in 3", () => {
    const r = sundownTrailExact();
    expect(r.rtp).toBeCloseTo(SUNDOWN_MATH.rtp, 5);
    expect(r.sdPerSpin).toBeCloseTo(SUNDOWN_MATH.sdPerUnit, 4);
    expect(r.winRate).toBeCloseTo(SUNDOWN_MATH.winRate, 6);
    expect(volBucket(r.sdPerSpin)).toBe("Low");
    expect(gameMath("slot").line).toBe("RTP 95.53% · Low volatility · wins about 1 in 3 spins");
  });

  it("Antler Ridge is ~95% Medium at a $1 coin, jackpots included", () => {
    const line = antlerRidgeLineExact();
    expect(line.rtp).toBeCloseTo(ANTLER_MATH.lineRtp, 5);
    expect(line.winRate).toBeCloseTo(ANTLER_MATH.winRate, 6);
    const at1 = antlerRidgeTotalExact(100, line);
    expect(at1.totalRtp).toBeCloseTo(0.95, 2);
    expect(at1.sdPerUnit).toBeCloseTo(ANTLER_MATH.sdAt100, 3);
    expect(volBucket(at1.sdPerUnit)).toBe("Medium");
    expect(volBucket(ANTLER_MATH.sdAt25)).toBe("Medium");
    expect(gameMath("vault").line).toContain("Medium volatility");
    expect(gameMath("vault").line).toContain("jackpots included");
    expect(gameMath("vault").line).toContain("wins about 1 in 4 spins");
  });

  it("Buckshot Bars is High volatility (~9.8–10.0 SD)", () => {
    const r1 = exactBuckshotRtp(1);
    const r3 = exactBuckshotRtp(3);
    expect(r1.rtp).toBeCloseTo(BUCKSHOT_MATH.rtp1, 5);
    expect(r3.rtp).toBeCloseTo(BUCKSHOT_MATH.rtp3, 5);
    expect(r1.sdPerUnit).toBeCloseTo(BUCKSHOT_MATH.sd1, 4);
    expect(r3.sdPerUnit).toBeCloseTo(BUCKSHOT_MATH.sd3, 4);
    expect(r1.winRate).toBeCloseTo(BUCKSHOT_MATH.winRate, 6);
    expect(volBucket(r1.sdPerUnit)).toBe("High");
    expect(volBucket(r3.sdPerUnit)).toBe("High");
    expect(gameMath("buckshot").line).toBe("RTP 94.44–94.67% · High volatility · wins about 1 in 11 spins");
  });

  it("hides Antler Ridge's never-payable WILD pay row", () => {
    expect(VS_REELS[1]).not.toContain("WILD");
    expect(VS_REELS[3]).not.toContain("WILD");
    expect("WILD" in VS_PAYTABLE).toBe(true);
    expect("WILD" in VS_DISPLAY_PAYTABLE).toBe(false);
  });
});

describe("table published figures", () => {
  it("blackjack is about 0.4% Low, pai gow about 2.9% Low, hold'em High with no rake", () => {
    expect(volBucket(TABLE_MATH.blackjack.sdPerUnit)).toBe("Low");
    expect(gameMath("blackjack").line).toBe("House edge 0.4% · Low volatility");
    expect(gameMath("paigow").line).toBe("House edge 2.9% · Low volatility");
    expect(gameMath("holdem").line).toContain("No rake");
    expect(gameMath("holdem").volatility).toBe("High");
  });
  it("roulette and craps are tagged by bet, not one bucket", () => {
    expect(gameMath("roulette").volatility).toBe("by-bet");
    expect(gameMath("craps").volatility).toBe("by-bet");
    expect(gameMath("roulette").line).toContain("volatility by bet");
    const straight = ROULETTE_BET_MATH.find((r) => r.label === "Straight up")!;
    const even = ROULETTE_BET_MATH.find((r) => r.label.startsWith("Red"))!;
    expect(straight.sdPerUnit).toBeCloseTo(oneRollSd(1, 38, 35), 12);
    expect(straight.volatility).toBe("Medium");
    expect(even.volatility).toBe("Low");
  });
});

describe("lobby volatility filter", () => {
  const games = ["slot", "vault", "buckshot", "blackjack", "roulette", "craps", "holdem", "paigow"].map((id) => gameMath(id));
  it("keeps Low games plus by-bet tables that have a Low bet", () => {
    expect(filterByVolatility(games, "Low").map((g) => g.id).sort()).toEqual(["blackjack", "craps", "paigow", "roulette", "slot"]);
  });
  it("keeps Medium games plus by-bet tables that have a Medium bet", () => {
    expect(filterByVolatility(games, "Medium").map((g) => g.id).sort()).toEqual(["craps", "roulette", "vault"]);
  });
  it("keeps only High games for the High filter", () => {
    expect(filterByVolatility(games, "High").map((g) => g.id).sort()).toEqual(["buckshot", "holdem"]);
  });
});
