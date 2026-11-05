import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { resetDbForTests } from "../src/lib/db";
import { applyLedger, debitBet, LedgerError } from "../src/lib/ledger";
import { chicagoMidnight, periodWindow, isTightening, limitView, requestLimit, settlePending, migrateLimits, COOL_OFF_MS } from "../src/lib/limits";
import { refillStatus } from "../src/lib/refill";

function mk() {
  const db = resetDbForTests();
  db.prepare(`INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, created_at)
    VALUES ('u1','u1@pit.test','h','T',1,0,0,datetime('now'))`).run();
  return db;
}
const row = (db: Database.Database, type: string, cents: number, at: string, key: string) =>
  db.prepare(`INSERT INTO ledger (id,user_id,type,amount_cents,balance_after_cents,idempotency_key,created_at) VALUES (?,?,?,?,0,?,?)`)
    .run(key, "u1", type, cents, key, at);

describe("Chicago calendar windows", () => {
  it("midnight is 06:00Z in CST and 05:00Z in CDT", () => {
    expect(chicagoMidnight(2026, 11, 5).toISOString()).toBe("2026-11-05T06:00:00.000Z");
    expect(chicagoMidnight(2026, 7, 4).toISOString()).toBe("2026-07-04T05:00:00.000Z");
  });
  it("day/week/month boundaries", () => {
    const now = new Date("2026-11-05T06:30:00Z"); // Thu 00:30 CST
    expect(periodWindow("day", now)).toEqual({ start: new Date("2026-11-05T06:00:00Z"), resetsAt: new Date("2026-11-06T06:00:00Z") });
    expect(periodWindow("week", now)).toEqual({ start: new Date("2026-11-02T06:00:00Z"), resetsAt: new Date("2026-11-09T06:00:00Z") });
    expect(periodWindow("month", now)).toEqual({ start: new Date("2026-11-01T05:00:00Z"), resetsAt: new Date("2026-12-01T06:00:00Z") });
    expect(periodWindow("all", now)).toEqual({ start: null, resetsAt: null });
  });
  it("late evening Chicago is still the same Chicago day", () => {
    const now = new Date("2026-11-06T05:59:00Z"); // Thu 23:59 CST
    expect(periodWindow("day", now).start!.toISOString()).toBe("2026-11-05T06:00:00.000Z");
  });
  it("month rolls over the year", () => {
    expect(periodWindow("month", new Date("2026-12-15T12:00:00Z")).resetsAt!.toISOString()).toBe("2027-01-01T06:00:00.000Z");
  });
});

describe("tightening vs loosening", () => {
  it("classifies changes", () => {
    expect(isTightening(null, { cents: 5000, period: "day" })).toBe(true);
    expect(isTightening({ cents: 5000, period: "day" }, { cents: 4000, period: "day" })).toBe(true);
    expect(isTightening({ cents: 5000, period: "day" }, { cents: 5000, period: "week" })).toBe(true);
    expect(isTightening({ cents: 5000, period: "day" }, { cents: 6000, period: "day" })).toBe(false);
    expect(isTightening({ cents: 5000, period: "week" }, { cents: 4000, period: "day" })).toBe(false);
    expect(isTightening({ cents: 5000, period: "day" }, null)).toBe(false);
  });
  it("tightening applies at once; loosening waits 24h; removal waits 24h", () => {
    const db = mk(); const t0 = new Date("2026-11-05T12:00:00Z");
    expect(requestLimit(db, "u1", "loss", { cents: 5000, period: "day" }, t0).applied).toBe("now");
    const r = requestLimit(db, "u1", "loss", { cents: 9000, period: "day" }, t0);
    expect(r.applied).toBe("pending");
    expect(r.effectiveAt).toBe(new Date(t0.getTime() + COOL_OFF_MS).toISOString());
    let v = limitView(db, "u1", "loss", new Date(t0.getTime() + COOL_OFF_MS - 1));
    expect(v.cents).toBe(5000); expect(v.pending).toMatchObject({ cents: 9000, period: "day" });
    v = limitView(db, "u1", "loss", new Date(t0.getTime() + COOL_OFF_MS));
    expect(v.cents).toBe(9000); expect(v.pending).toBeNull();
    const t1 = new Date(t0.getTime() + COOL_OFF_MS + 1000);
    expect(requestLimit(db, "u1", "loss", null, t1).applied).toBe("pending");
    expect(limitView(db, "u1", "loss", t1).cents).toBe(9000);
    expect(limitView(db, "u1", "loss", new Date(t1.getTime() + COOL_OFF_MS)).cents).toBeNull();
  });
  it("tightening cancels a pending loosening", () => {
    const db = mk(); const t0 = new Date("2026-11-05T12:00:00Z");
    requestLimit(db, "u1", "deposit", { cents: 5000, period: "week" }, t0);
    requestLimit(db, "u1", "deposit", null, t0);
    expect(requestLimit(db, "u1", "deposit", { cents: 3000, period: "week" }, t0).applied).toBe("now");
    const v = limitView(db, "u1", "deposit", new Date(t0.getTime() + 2 * COOL_OFF_MS));
    expect(v).toMatchObject({ cents: 3000, period: "week", pending: null });
  });
  it("re-sending the queued change keeps its clock; a different loosening restarts it", () => {
    const db = mk(); const t0 = new Date("2026-11-05T12:00:00Z"); const t1 = new Date(t0.getTime() + 3600_000);
    requestLimit(db, "u1", "loss", { cents: 5000, period: "day" }, t0);
    const a = requestLimit(db, "u1", "loss", { cents: 9000, period: "day" }, t0);
    expect(requestLimit(db, "u1", "loss", { cents: 9000, period: "day" }, t1)).toEqual(a);
    expect(requestLimit(db, "u1", "loss", { cents: 9500, period: "day" }, t1).effectiveAt).toBe(new Date(t1.getTime() + COOL_OFF_MS).toISOString());
  });
  it("settlePending is idempotent", () => {
    const db = mk(); const t0 = new Date("2026-11-05T12:00:00Z");
    requestLimit(db, "u1", "deposit", { cents: 5000, period: "day" }, t0);
    requestLimit(db, "u1", "deposit", { cents: 8000, period: "day" }, t0);
    const later = new Date(t0.getTime() + COOL_OFF_MS + 5);
    settlePending(db, "u1", later); settlePending(db, "u1", later);
    expect(limitView(db, "u1", "deposit", later)).toMatchObject({ cents: 8000, pending: null });
  });
});

describe("periods count only the current window", () => {
  it("loss used = this Chicago day only", () => {
    const db = mk(); const now = new Date("2026-11-05T18:00:00Z");
    requestLimit(db, "u1", "loss", { cents: 2000, period: "day" }, now);
    row(db, "bet", -1500, "2026-11-05T05:59:00.000Z", "yday"); // Wed 23:59 CST
    row(db, "bet", -800, "2026-11-05T07:00:00.000Z", "today");
    row(db, "payout", 300, "2026-11-05T07:01:00.000Z", "todaypay");
    const v = limitView(db, "u1", "loss", now);
    expect(v.usedCents).toBe(500);
    expect(v.resetsAt).toBe("2026-11-06T06:00:00.000Z");
  });
  it("ledger enforces a daily deposit limit live, and refill shows resetsAt", () => {
    const db = mk();
    requestLimit(db, "u1", "deposit", { cents: 2500, period: "day" });
    applyLedger({ userId: "u1", type: "deposit", amountCents: 2500, idempotencyKey: "d1" }, db);
    expect(() => applyLedger({ userId: "u1", type: "deposit", amountCents: 1000, idempotencyKey: "d2" }, db)).toThrow(LedgerError);
    debitBet("u1", 2500, "slot", "r", "b1", undefined, db);
    const s = refillStatus(db, "u1");
    expect(s).toMatchObject({ ok: false, reason: "deposit_limit" });
    expect((s as any).resetsAt).toBe(periodWindow("day", new Date()).resetsAt!.toISOString());
  });
  it("loss limit blocks a bet that would cross it", () => {
    const db = mk();
    applyLedger({ userId: "u1", type: "deposit", amountCents: 5000, idempotencyKey: "d1" }, db);
    requestLimit(db, "u1", "loss", { cents: 1000, period: "week" });
    debitBet("u1", 1000, "slot", "r", "b1", undefined, db);
    expect(() => debitBet("u1", 100, "slot", "r", "b2", undefined, db)).toThrow(/loss limit/);
    expect(refillStatus(db, "u1")).toMatchObject({ ok: false, reason: "loss_limit" });
  });
});

describe("migration", () => {
  it("adds columns and marks pre-existing limits all-time (no loosening)", () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, deposit_limit_cents INTEGER, loss_limit_cents INTEGER);
      INSERT INTO users VALUES ('a', 5000, NULL), ('b', NULL, 2000);`);
    migrateLimits(db); migrateLimits(db);
    const rows = db.prepare("SELECT id, deposit_limit_period, loss_limit_period FROM users ORDER BY id").all();
    expect(rows).toEqual([
      { id: "a", deposit_limit_period: "all", loss_limit_period: null },
      { id: "b", deposit_limit_period: null, loss_limit_period: "all" },
    ]);
  });
  it("moving from all-time to a period counts as loosening", () => {
    expect(isTightening({ cents: 5000, period: "all" }, { cents: 5000, period: "month" })).toBe(false);
  });
});
