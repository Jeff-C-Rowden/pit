import { describe, it, expect, beforeEach } from "vitest";
import { resetDbForTests } from "../src/lib/db";
import { applyLedger, getBalance, getBonusBalance, netLossCents, debitBet, LedgerError } from "../src/lib/ledger";
import { splitBet, splitWin, debitPlayBet, creditPlayWin, grantTestBonus, creditBonus, isBonusCashEligible, BONUS_PLAYABLE, TEST_BONUS_CENTS } from "../src/lib/bonus";
import { exactBuckshotRtp, BB_BOUNTY_TABLE, BB_TABLE, spinBuckshot } from "../src/lib/games/buckshot";
import { BOUNTY_MATH, gameMath } from "../src/lib/gameMath";
import { netLossSince } from "../src/lib/limits";

function seed(cash = 0) {
  const db = resetDbForTests();
  db.prepare(`INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, created_at)
    VALUES ('u1','u1@pit.test','h','T',1,0,?,datetime('now'))`).run(cash);
  return db;
}

describe("bonus routing (pure)", () => {
  it("cash first, then bonus; bonus first on Bonus to Cash machines", () => {
    expect(splitBet(100, 60, 500)).toEqual({ cashCents: 60, bonusCents: 40 });
    expect(splitBet(100, 500, 500)).toEqual({ cashCents: 100, bonusCents: 0 });
    expect(splitBet(100, 500, 30, true)).toEqual({ cashCents: 70, bonusCents: 30 });
    expect(splitBet(100, 0, 100, true)).toEqual({ cashCents: 0, bonusCents: 100 });
    expect(() => splitBet(100, 40, 59)).toThrow(LedgerError);
  });
  it("wins split pro rata; the bonus share stays bonus except on Bonus to Cash machines", () => {
    const split = { cashCents: 60, bonusCents: 40 };
    expect(splitWin(250, split, false)).toEqual({ cashCents: 150, bonusCents: 100, convertedCents: 0 });
    expect(splitWin(250, split, true)).toEqual({ cashCents: 250, bonusCents: 0, convertedCents: 100 });
    expect(splitWin(0, split, true)).toEqual({ cashCents: 0, bonusCents: 0, convertedCents: 0 });
    // odd cents: bonus share rounds down, the remainder pays cash; total is always exact
    const w = splitWin(101, { cashCents: 1, bonusCents: 2 }, false);
    expect(w.cashCents + w.bonusCents).toBe(101);
    expect(w.bonusCents).toBe(67);
    for (let i = 0; i < 500; i++) {
      const bet = 1 + Math.floor(Math.random() * 1000), b = Math.floor(Math.random() * (bet + 1));
      const win = Math.floor(Math.random() * 100000);
      const r = splitWin(win, { cashCents: bet - b, bonusCents: b }, false);
      expect(r.cashCents + r.bonusCents).toBe(win);
      expect(r.bonusCents).toBeLessThanOrEqual(win);
    }
  });
  it("only Bounty Bars is Bonus to Cash; bonus plays on slots only", () => {
    expect(isBonusCashEligible("bounty")).toBe(true);
    expect(isBonusCashEligible("buckshot")).toBe(false);
    expect([...BONUS_PLAYABLE].sort()).toEqual(["bounty", "buckshot", "slot"]);
  });
});

describe("bonus ledger", () => {
  let db: ReturnType<typeof seed>;
  beforeEach(() => { db = seed(60); });

  it("a mixed bet on a regular slot: cash first, bonus share of the win stays bonus", () => {
    creditBonus("u1", 500, null, null, "g1", null, "promo", db);
    const f = debitPlayBet("u1", 100, "buckshot", "s1", "k1", {}, db);
    expect(f).toEqual({ cashCents: 60, bonusCents: 40 });
    expect(getBalance("u1")).toBe(0);
    expect(getBonusBalance("u1")).toBe(460);
    const w = creditPlayWin("u1", 250, "buckshot", "s1", "p1", f, {}, db);
    expect(w).toEqual({ cashCents: 150, bonusCents: 100, convertedCents: 0 });
    expect(getBalance("u1")).toBe(150);
    expect(getBonusBalance("u1")).toBe(560);
    const rows = db.prepare("SELECT type, amount_cents a, currency FROM ledger WHERE ref='s1' ORDER BY rowid").all();
    expect(rows).toEqual([
      { type: "bet", a: -60, currency: "cash" }, { type: "bet", a: -40, currency: "bonus" },
      { type: "payout", a: 150, currency: "cash" }, { type: "payout", a: 100, currency: "bonus" },
    ]);
  });

  it("Bonus to Cash: a bonus-funded spin pays its winnings in cash", () => {
    creditBonus("u1", 500, null, null, "g1", null, "promo", db);
    const f = debitPlayBet("u1", 100, "bounty", "s2", "k2", {}, db);
    expect(f).toEqual({ cashCents: 0, bonusCents: 100 });
    expect(getBalance("u1")).toBe(60);
    const w = creditPlayWin("u1", 300, "bounty", "s2", "p2", f, {}, db);
    expect(w).toEqual({ cashCents: 300, bonusCents: 0, convertedCents: 300 });
    expect(getBalance("u1")).toBe(360);
    expect(getBonusBalance("u1")).toBe(400);
  });

  it("is idempotent per key and never overdraws", () => {
    creditBonus("u1", 50, null, null, "g1", null, "promo", db);
    const a = debitPlayBet("u1", 100, "slot", "s3", "k3", {}, db);
    const b = debitPlayBet("u1", 100, "slot", "s3", "k3", {}, db);
    expect(b).toEqual(a);
    expect(getBalance("u1") + getBonusBalance("u1")).toBe(10);
    expect(() => debitPlayBet("u1", 100, "slot", "s4", "k4", {}, db)).toThrow(/insufficient/);
    expect(getBalance("u1") + getBonusBalance("u1")).toBe(10);
  });

  it("bonus is never used on table games or withdrawals", () => {
    creditBonus("u1", 5000, null, null, "g1", null, "promo", db);
    expect(() => debitBet("u1", 100, "blackjack", "h1", "bj1", {}, db)).toThrow(/insufficient/);
    expect(() => applyLedger({ userId: "u1", type: "withdrawal_hold", amountCents: -1000, idempotencyKey: "wd1" }, db)).toThrow(/insufficient/);
    expect(getBonusBalance("u1")).toBe(5000);
  });

  it("loss limits and net loss count cash only", () => {
    creditBonus("u1", 500, null, null, "g1", null, "promo", db);
    const f = debitPlayBet("u1", 100, "buckshot", "s5", "k5", {}, db);
    expect(f.bonusCents).toBe(40);
    expect(netLossCents("u1", db)).toBe(60);
    expect(netLossSince(db, "u1", null)).toBe(60);
  });

  it("the sandbox test bonus pays once per Chicago day", () => {
    grantTestBonus("u1", "2026-11-11", db);
    grantTestBonus("u1", "2026-11-11", db);
    expect(getBonusBalance("u1")).toBe(TEST_BONUS_CENTS);
    grantTestBonus("u1", "2026-11-12", db);
    expect(getBonusBalance("u1")).toBe(2 * TEST_BONUS_CENTS);
    expect(getBalance("u1")).toBe(60);
  });
});

describe("Bounty Bars (Bonus to Cash) RTP", () => {
  it("is exactly 90.31% (1–2 coins) / 90.53% (3 coins), below Buckshot Bars, inside 89–91%", () => {
    const r1 = exactBuckshotRtp(1, BB_BOUNTY_TABLE), r3 = exactBuckshotRtp(3, BB_BOUNTY_TABLE);
    expect(r1.totalPay).toBe(13525);
    expect(r1.rtp).toBeCloseTo(13525 / 14976, 12);
    expect(r1.rtp).toBeCloseTo(BOUNTY_MATH.rtp1, 5);
    expect(r3.rtp).toBeCloseTo(BOUNTY_MATH.rtp3, 5);
    expect(r1.sdPerUnit).toBeCloseTo(BOUNTY_MATH.sd1, 4);
    expect(r3.sdPerUnit).toBeCloseTo(BOUNTY_MATH.sd3, 4);
    expect(r1.rtp).toBeGreaterThan(0.89);
    expect(r3.rtp).toBeLessThan(0.91);
    expect(r1.rtp).toBeLessThan(exactBuckshotRtp(1, BB_TABLE).rtp - 0.03);
    expect(gameMath("bounty").line).toBe("RTP 90.31–90.53% · High volatility · Bonus to Cash · wins about 1 in 11 spins");
  });
  it("uses the same reels and uniform stops (only the pays differ)", () => {
    let i = 0;
    const pick = (n: number) => (i++ * 7) % n;
    const a = spinBuckshot(1, 100, pick);
    i = 0;
    const b = spinBuckshot(1, 100, pick, BB_BOUNTY_TABLE);
    expect(b.window).toEqual(a.window);
  });
  it("Monte Carlo agrees with the exact figure (200k spins, ±1%)", () => {
    // Seeded: an unseeded 200k run at SD ~9.4 per coin missed the ±3-point band about 1 run in 7.
    let s = 20261111;
    const pick = (n: number) => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return Math.floor((s / 4294967296) * n); };
    let pay = 0;
    const N = 200_000;
    for (let k = 0; k < N; k++) pay += spinBuckshot(1, 100, pick, BB_BOUNTY_TABLE).payCoins;
    expect(Math.abs(pay / N - BOUNTY_MATH.rtp1)).toBeLessThan(0.01 * 3);
  });
});
