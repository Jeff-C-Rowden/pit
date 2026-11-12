/** Max Bet sets the largest valid bet the player's usable credit covers, capped at the game's max. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { maxBetCoin, maxBetRefusal, playMaxCoins } from "../src/lib/cabinet";
import { spinNoticeWantsCage } from "../src/lib/spinNotice";

describe("maxBetCoin", () => {
  it("Kettle of Clover (coin x 10): a $123.45 balance gets a $12.34 coin ($123.40 spin), never the $500 max", () => {
    expect(maxBetCoin(12345, 10)).toBe(1234);
    expect(maxBetCoin(12345, 10)! * 10).toBeLessThanOrEqual(12345);
  });
  it("caps at the published max coin when the balance covers it", () => {
    expect(maxBetCoin(10_000_000, 9)).toBe(5000);
    expect(maxBetCoin(45_000, 9)).toBe(5000);
    expect(maxBetCoin(44_999, 9)).toBe(4999);
  });
  it("exactly the smallest bet is covered; one cent less is not", () => {
    expect(maxBetCoin(225, 9)).toBe(25);
    expect(maxBetCoin(224, 9)).toBeNull();
    expect(maxBetCoin(0, 10)).toBeNull();
    expect(maxBetCoin(-5, 10)).toBeNull();
  });
  it("is always a bet the balance covers, within min..max", () => {
    for (let bal = 0; bal < 60_000; bal += 137) for (const per of [9, 10]) {
      const c = maxBetCoin(bal, per);
      if (c === null) expect(bal).toBeLessThan(25 * per);
      else { expect(c * per).toBeLessThanOrEqual(bal); expect(c).toBeGreaterThanOrEqual(25); expect(c).toBeLessThanOrEqual(5000); expect(Math.min(5000, c + 1) * per > bal || c === 5000).toBe(true); }
    }
  });
});

describe("classic PLAY MAX", () => {
  it("plays the most coins the credit covers at the chosen coin value, up to 3", () => {
    expect(playMaxCoins(10_000, 500)).toBe(3);
    expect(playMaxCoins(1_400, 500)).toBe(2);
    expect(playMaxCoins(500, 500)).toBe(1);
    expect(playMaxCoins(499, 500)).toBe(0);
  });
});

describe("refusal + wiring", () => {
  it("the refusal links to the Cage via the spin notice", () => {
    expect(spinNoticeWantsCage(maxBetRefusal("$1.00", "$2.50"))).toBe(true);
  });
  it("every slot's Max Bet uses the credit-aware helper (no hard-coded max coin)", () => {
    for (const f of ["src/app/slot/page.tsx", "src/app/vault/page.tsx", "src/app/mine/page.tsx", "src/app/prairie/page.tsx", "src/app/clover/page.tsx"]) {
      const s = readFileSync(f, "utf8");
      const fn = s.slice(s.indexOf("function onMaxBet"), s.indexOf("function onMaxBet") + 500);
      expect(fn, f).toMatch(/maxBetCoin\(balRef\.current/);
      expect(fn, f).toMatch(/maxBetRefusal/);
      expect(fn, f).not.toMatch(/setCoin\((SLOT_COIN_MAX|5000)\)/);
    }
    const bb = readFileSync("src/components/BuckshotGame.tsx", "utf8");
    expect(bb).toMatch(/playMaxCoins\(balRef\.current, denom, BB_MAX_COINS\)/);
  });
});
