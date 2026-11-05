import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { resetDbForTests } from "../src/lib/db";
import { applyLedger, debitBet } from "../src/lib/ledger";
import { takeBreak, breakUntil, sessionActivity, BREAK_MS } from "../src/lib/session";
import { testClockEnabled, serverNow, advanceTestClock, resetTestClock } from "../src/lib/clock";
import { resultPhrase } from "../src/components/LiveAnnounce";

function mk() {
  const db = resetDbForTests();
  db.prepare(`INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, created_at)
    VALUES ('u1','u1@pit.test','h','T',1,0,100000,datetime('now'))`).run();
  return db;
}
let n = 0;
const row = (db: Database.Database, type: string, cents: number, at: Date, game = "slot", ref = "r") => {
  const key = `b${n++}`;
  db.prepare(`INSERT INTO ledger (id,user_id,type,amount_cents,balance_after_cents,game,ref,idempotency_key,created_at) VALUES (?,?,?,?,0,?,?,?,?)`)
    .run(key, "u1", type, cents, game, ref, key, at.toISOString());
};
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

describe("test clock is locked off outside local QA", () => {
  afterEach(() => { resetTestClock(); delete process.env.PIT_TEST_CLOCK; });
  it("disabled by default, on Vercel, and in Vercel production even with the flag", () => {
    expect(testClockEnabled({})).toBe(false);
    expect(testClockEnabled({ PIT_TEST_CLOCK: "1", VERCEL: "1" })).toBe(false);
    expect(testClockEnabled({ PIT_TEST_CLOCK: "1", VERCEL_ENV: "production" })).toBe(false);
    expect(testClockEnabled({ PIT_TEST_CLOCK: "1" })).toBe(true);
  });
  it("cannot advance when disabled; serverNow is real time", () => {
    expect(() => advanceTestClock(60_000)).toThrow();
    expect(Math.abs(serverNow().getTime() - Date.now())).toBeLessThan(50);
  });
  it("advances only when enabled, and bounds the step", () => {
    process.env.PIT_TEST_CLOCK = "1";
    advanceTestClock(10 * 60_000);
    expect(serverNow().getTime() - Date.now()).toBeGreaterThan(9.9 * 60_000);
    expect(() => advanceTestClock(-1)).toThrow();
    expect(() => advanceTestClock(25 * 3600_000)).toThrow();
  });
});

describe("take a break now", () => {
  it("starts at once for 30 minutes and is never shortened", () => {
    const db = mk(); const t = new Date("2026-11-05T18:00:00Z");
    const until = takeBreak(db, "u1", t);
    expect(until).toBe(new Date(t.getTime() + BREAK_MS).toISOString());
    expect(takeBreak(db, "u1", new Date(t.getTime() - 60_000))).toBe(until);
    expect(breakUntil(db, "u1", new Date(t.getTime() + BREAK_MS))).toBeNull();
  });
  it("refuses new bets but lets a round in play finish and pay", () => {
    const db = mk();
    debitBet("u1", 1000, "blackjack", "hand9", "h1", undefined, db);
    takeBreak(db, "u1");
    expect(() => debitBet("u1", 500, "roulette", "x", "nb", undefined, db)).toThrow(/break/);
    try { debitBet("u1", 500, "craps", "tbl", "nb2", undefined, db); } catch (e: any) { expect(e.code).toBe("ON_BREAK"); }
    expect(() => debitBet("u1", 1000, "blackjack", "hand9", "dbl", undefined, db)).not.toThrow();
    expect(() => applyLedger({ userId: "u1", type: "payout", amountCents: 4000, game: "blackjack", ref: "hand9", idempotencyKey: "pay" }, db)).not.toThrow();
  });
});

describe("activity", () => {
  it("lists only this session's play rows, newest first", () => {
    const db = mk(); const t = new Date("2026-11-05T18:00:00Z"); const ago = (m: number) => new Date(t.getTime() - m * 60000);
    row(db, "bet", -900, ago(100)); // older session
    row(db, "bet", -500, ago(20), "roulette"); row(db, "payout", 1800, ago(19), "roulette"); row(db, "deposit", 2500, ago(10));
    const a = sessionActivity(db, "u1", t);
    expect(a.rows.map((r) => r.amountCents)).toEqual([1800, -500]);
    expect(a.session.netCents).toBe(1300);
  });
  it("empty when no session", () => { expect(sessionActivity(mk(), "u1").rows).toEqual([]); });
});

describe("result phrases use exact amounts", () => {
  it("win / even / loss", () => {
    expect(resultPhrase(500, 1800, money)).toBe("You won $13.00. Paid $18.00 on $5.00 bet.");
    expect(resultPhrase(500, 500, money)).toBe("You broke even. $5.00 back.");
    expect(resultPhrase(500, 0, money)).toBe("You lost $5.00.");
  });
});
