import { describe, it, expect } from "vitest";
import { resetDbForTests } from "../src/lib/db";
import { debitBet, creditPayout } from "../src/lib/ledger";
import { takeBreak, breakUntil, breakKind, selfExclude, sessionActivity, activityCsv, EXCLUSION_CHOICES } from "../src/lib/session";
import { newCrapsTable, resolveRoll } from "../src/lib/games/craps";
import { paidPhrase } from "../src/lib/paidPhrase";
import { pauseText } from "../src/lib/pauseText";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
function mk() {
  const db = resetDbForTests();
  db.prepare(`INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, created_at)
    VALUES ('u1','u1@pit.test','h','T',1,0,100000,datetime('now'))`).run();
  return db;
}

describe("craps payout splits into winnings and stake back", () => {
  it("field win: $5 bet returns $10 = won $5, $5 back", () => {
    const s = newCrapsTable(); s.field = 500;
    const r = resolveRoll(s, [1, 3]);
    expect(r.payoutCents).toBe(1000); expect(r.stakeBackCents).toBe(500);
    expect(paidPhrase(r.payoutCents, r.stakeBackCents, money)).toBe("won $5.00, $5.00 back");
  });
  it("pass line come-out 7: winnings only, the bet stays up", () => {
    const s = newCrapsTable(); s.pass = 500;
    const r = resolveRoll(s, [3, 4]);
    expect(r.payoutCents).toBe(500); expect(r.stakeBackCents).toBe(0); expect(s.pass).toBe(500);
    expect(paidPhrase(500, 0, money)).toBe("won $5.00 (your bet stays on the table)");
  });
  it("stake back never exceeds what was paid, over many random rolls", () => {
    for (let i = 0; i < 3000; i++) {
      const s = newCrapsTable(); s.field = 100; s.pass = 200; s.yo = 100; s.anyCraps = 100;
      const d: [number, number] = [1 + (i % 6), 1 + Math.floor(i / 6) % 6];
      const r = resolveRoll(s, d);
      expect(r.stakeBackCents).toBeGreaterThanOrEqual(0);
      expect(r.stakeBackCents).toBeLessThanOrEqual(r.payoutCents);
    }
  });
  it("activity rows and CSV carry the same split as the ledger payout row", () => {
    const db = mk();
    debitBet("u1", 500, "craps", "t", "k1", undefined, db);
    creditPayout("u1", 1000, "craps", "t-r", "k2", { stakeBackCents: 500, wonCents: 500 }, db);
    const { rows } = sessionActivity(db, "u1");
    const pay = rows.find((r) => r.type === "payout")!;
    expect(pay.stakeBackCents).toBe(500);
    const csv = activityCsv(rows).trim().split("\r\n");
    expect(csv[0]).toContain('"won_usd","stake_back_usd"');
    expect(csv).toHaveLength(3);
    expect(csv[1]).toContain('"bet","-5.00"');
    expect(csv[2]).toContain('"payout","10.00","5.00","5.00"');
    expect(csv[2]).toMatch(/C[SD]T/);
  });
  it("CSV quotes awkward values", () => {
    const csv = activityCsv([{ at: new Date().toISOString(), type: "bet", game: 'a"b,c', amountCents: -100, balanceAfterCents: 0 }]);
    expect(csv).toContain('"a""b,c"');
  });
});

describe("self-exclusion", () => {
  it("only 24h, 7d, 30d; starts now and blocks new bets server-side", () => {
    const db = mk(); const now = new Date();
    expect(Object.keys(EXCLUSION_CHOICES)).toEqual(["24h", "7d", "30d"]);
    expect(() => selfExclude(db, "u1", "1h", now)).toThrow();
    expect(() => selfExclude(db, "u1", "__proto__", now)).toThrow();
    const until = selfExclude(db, "u1", "7d", now);
    expect(Date.parse(until) - now.getTime()).toBe(7 * 24 * 3600_000);
    expect(breakKind(db, "u1", now)).toBe("exclusion");
    let code = ""; try { debitBet("u1", 500, "slot", "x", "e1", undefined, db); } catch (e: any) { code = e.code; expect(e.message).toMatch(/excluded yourself/); }
    expect(code).toBe("ON_BREAK");
  });
  it("is never shortened: a shorter break or exclusion keeps the later end", () => {
    const db = mk(); const now = new Date();
    const long = selfExclude(db, "u1", "30d", now);
    expect(takeBreak(db, "u1", now)).toBe(long);
    expect(selfExclude(db, "u1", "24h", now)).toBe(long);
    expect(breakUntil(db, "u1", now)).toBe(long);
    expect(breakKind(db, "u1", now)).toBe("exclusion");
  });
  it("a longer exclusion during a short break applies at once (no cooling-off)", () => {
    const db = mk(); const now = new Date();
    takeBreak(db, "u1", now);
    const until = selfExclude(db, "u1", "24h", now);
    expect(breakUntil(db, "u1", now)).toBe(until);
    expect(Date.parse(until) - now.getTime()).toBe(24 * 3600_000);
  });
  it("ends on its own at the stated time", () => {
    const db = mk(); const now = new Date();
    const until = selfExclude(db, "u1", "24h", now);
    const after = new Date(Date.parse(until) + 1000);
    expect(breakUntil(db, "u1", after)).toBeNull();
    expect(() => debitBet("u1", 500, "slot", "x", "e2", undefined, db, )).toThrow(); // still now: blocked
  });
});

describe("paused status text", () => {
  it("calm line for each pause, null otherwise", () => {
    const t = "2026-11-06T18:00:00.000Z";
    expect(pauseText({ breakUntil: t, breakKind: "exclusion" })).toMatch(/^Bets are paused: you excluded yourself until .*C[SD]T\.$/);
    expect(pauseText({ breakUntil: t, breakKind: "break" })).toMatch(/break until/);
    expect(pauseText({ blocked: { breakEndsAt: t } })).toMatch(/session time is up/);
    expect(pauseText({})).toBeNull();
  });
});
