import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { resetDbForTests } from "../src/lib/db";
import { applyLedger, debitBet, LedgerError } from "../src/lib/ledger";
import { requestLimit, limitView, cancelPending, COOL_OFF_MS } from "../src/lib/limits";
import { currentSession, requestSetting, settingView, cancelSettingPending, sessionBlock, migrateSession, BREAK_MS } from "../src/lib/session";

function mk() {
  const db = resetDbForTests();
  db.prepare(`INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, created_at)
    VALUES ('u1','u1@pit.test','h','T',1,0,100000,datetime('now'))`).run();
  return db;
}
let n = 0;
const row = (db: Database.Database, type: string, cents: number, at: Date, game = "slot", ref = "r") => {
  const key = `k${n++}`;
  db.prepare(`INSERT INTO ledger (id,user_id,type,amount_cents,balance_after_cents,game,ref,idempotency_key,created_at) VALUES (?,?,?,?,0,?,?,?,?)`)
    .run(key, "u1", type, cents, game, ref, key, at.toISOString());
};
const T = new Date("2026-11-05T18:00:00Z");
const ago = (min: number, base = T) => new Date(base.getTime() - min * 60000);

describe("session from the ledger", () => {
  it("no play → inactive", () => {
    expect(currentSession(mk(), "u1", T).active).toBe(false);
  });
  it("splits at a 30-minute gap and nets only the current run", () => {
    const db = mk();
    row(db, "bet", -1000, ago(120)); row(db, "payout", 5000, ago(119)); // old session
    row(db, "bet", -500, ago(40)); row(db, "payout", 200, ago(20)); row(db, "bet", -300, ago(2));
    row(db, "deposit", 9999, ago(10)); // deposits are not play
    const s = currentSession(db, "u1", T);
    expect(s.active).toBe(true);
    expect(s.minutes).toBe(40);
    expect(s.netCents).toBe(-600);
    expect(s.breakEndsAt).toBe(new Date(ago(2).getTime() + BREAK_MS).toISOString());
  });
  it("ends after a 30-minute pause", () => {
    const db = mk();
    row(db, "bet", -500, ago(31));
    expect(currentSession(db, "u1", T).active).toBe(false);
  });
});

describe("time settings follow the cooling-off rules", () => {
  it("adding or shortening applies now; lengthening or off waits 24h and keeps its clock", () => {
    const db = mk();
    expect(requestSetting(db, "u1", "session", 60, T).applied).toBe("now");
    expect(requestSetting(db, "u1", "session", 30, T).applied).toBe("now");
    const p = requestSetting(db, "u1", "session", 120, T);
    expect(p.applied).toBe("pending");
    expect(p.effectiveAt).toBe(new Date(T.getTime() + COOL_OFF_MS).toISOString());
    const again = requestSetting(db, "u1", "session", 120, new Date(T.getTime() + 3600_000));
    expect(again.effectiveAt).toBe(p.effectiveAt);
    expect(settingView(db, "u1", "session", T).minutes).toBe(30);
    expect(settingView(db, "u1", "session", new Date(T.getTime() + COOL_OFF_MS)).minutes).toBe(120);
    expect(requestSetting(db, "u1", "reality", 15, T).applied).toBe("now");
    expect(requestSetting(db, "u1", "reality", null, T).applied).toBe("pending");
    expect(requestSetting(db, "u1", "reality", 15, T).applied).toBe("unchanged");
    expect(settingView(db, "u1", "reality", T).pending).toBeNull();
  });
  it("rejects values outside the choices", () => {
    expect(() => requestSetting(mk(), "u1", "reality", 7, T)).toThrow();
  });
  it("keep my current setting clears the queue at once", () => {
    const db = mk();
    requestSetting(db, "u1", "session", 30, T); requestSetting(db, "u1", "session", null, T);
    cancelSettingPending(db, "u1", "session", T);
    const v = settingView(db, "u1", "session", new Date(T.getTime() + 2 * COOL_OFF_MS));
    expect(v).toEqual({ minutes: 30, pending: null });
  });
  it("migration is idempotent", () => {
    const db = mk();
    expect(() => { migrateSession(db); migrateSession(db); }).not.toThrow();
  });
});

describe("keep my current limit", () => {
  it("cancels a pending loosening; the tighter limit stays", () => {
    const db = mk();
    requestLimit(db, "u1", "loss", { cents: 1000, period: "day" }, T);
    expect(requestLimit(db, "u1", "loss", { cents: 5000, period: "day" }, T).applied).toBe("pending");
    cancelPending(db, "u1", "loss", T);
    const v = limitView(db, "u1", "loss", new Date(T.getTime() + 2 * COOL_OFF_MS));
    expect(v.cents).toBe(1000);
    expect(v.pending).toBeNull();
  });
});

describe("session limit at the ledger", () => {
  it("refuses a new bet once time is up but never an in-flight blackjack double", () => {
    const db = mk();
    const now = new Date();
    requestSetting(db, "u1", "session", 30, now);
    row(db, "bet", -1000, ago(35, now), "blackjack", "hand1");
    row(db, "bet", -100, ago(18, now), "slot", "s");
    row(db, "bet", -100, ago(1, now), "slot", "s");
    expect(sessionBlock(db, "u1", now)).not.toBeNull();
    expect(() => debitBet("u1", 500, "slot", "s2", "nb1", undefined, db)).toThrow(LedgerError);
    try { debitBet("u1", 500, "roulette", "s3", "nb2", undefined, db); } catch (e: any) { expect(e.code).toBe("SESSION_LIMIT"); }
    expect(() => debitBet("u1", 1000, "blackjack", "hand1", "dbl", undefined, db)).not.toThrow();
    expect(() => applyLedger({ userId: "u1", type: "payout", amountCents: 4000, game: "blackjack", ref: "hand1", idempotencyKey: "p1" }, db)).not.toThrow();
  });
  it("no limit → no block", () => {
    const db = mk();
    row(db, "bet", -100, ago(200 - 199, new Date()));
    expect(sessionBlock(db, "u1")).toBeNull();
  });
});
