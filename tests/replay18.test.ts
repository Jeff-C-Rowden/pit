import { describe, it, expect } from "vitest";
import { resetDbForTests } from "../src/lib/db";
import { debitBet, creditPayout } from "../src/lib/ledger";
import { ledgerLines, lastCrapsRoll, lastBlackjack, cageHref } from "../src/lib/replay";
import { startBlackjack, takeInsurance, stand } from "../src/lib/games/blackjack";

function setup() {
  const db = resetDbForTests();
  db.prepare(`INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, created_at)
    VALUES ('u1','u1@pit.test','h','T',1,0,10000,datetime('now'))`).run();
  return db;
}

describe("replay from the ledger", () => {
  it("ledgerLines filters by game and ref, newest first", () => {
    const db = setup();
    debitBet("u1", 500, "craps", "t1", "a", undefined, db);
    debitBet("u1", 300, "roulette", "s1", "b", undefined, db);
    creditPayout("u1", 1000, "craps", "t1-1", "c", undefined, db);
    expect(ledgerLines(db, "u1").length).toBe(3);
    const m = ledgerLines(db, "u1", { game: "craps", ref: "t1-1" });
    expect(m).toHaveLength(1);
    expect(m[0].amountCents).toBe(1000);
    expect(ledgerLines(db, "u1", { game: "roulette" })[0].amountCents).toBe(-300);
  });

  it("lastCrapsRoll uses the saved dice and reads the paid amount from the ledger", () => {
    const db = setup();
    expect(lastCrapsRoll(db, "u1")).toBeNull();
    const save = (rec: object) => db.prepare(`INSERT OR REPLACE INTO game_states (id, user_id, game, status, state_json, created_at, updated_at) VALUES ('t1','u1','craps','open',?,datetime('now'),datetime('now'))`).run(JSON.stringify({ id: "t1", lastRollRecord: rec }));
    debitBet("u1", 500, "craps", "t1", "a", undefined, db);
    creditPayout("u1", 1000, "craps", "t1-1", "c1", undefined, db);
    save({ ref: "t1-1", dice: [5, 6], riskedCents: 500, at: "x" });
    expect(lastCrapsRoll(db, "u1")!.payoutCents).toBe(1000);
    save({ ref: "t1-2", dice: [1, 1], riskedCents: 500, at: "y" });
    const r = lastCrapsRoll(db, "u1")!;
    expect(r.ref).toBe("t1-2");
    expect(r.total).toBe(2);
    expect(r.payoutCents).toBe(0);
    expect(r.riskedCents).toBe(500);
  });

  it("lastBlackjack takes cards from the saved hand and money from the ledger", () => {
    const db = setup();
    expect(lastBlackjack(db, "u1")).toBeNull();
    let s = startBlackjack(1000);
    if (s.phase === "insurance") s = takeInsurance(s, false);
    let guard = 0;
    while (s.phase === "play" && guard++ < 5) s = stand(s);
    expect(s.phase).toBe("settled");
    db.prepare(`INSERT INTO game_states (id, user_id, game, status, state_json, created_at, updated_at) VALUES ('g1','u1','blackjack','settled',?,datetime('now'),datetime('now'))`).run(JSON.stringify(s));
    debitBet("u1", 1000, "blackjack", "g1", "bj1", undefined, db);
    creditPayout("u1", 2000, "blackjack", "g1", "bj2", undefined, db);
    const b = lastBlackjack(db, "u1")!;
    expect(b.ref).toBe("g1");
    expect(b.stakeCents).toBe(1000);
    expect(b.payoutCents).toBe(2000);
    expect(b.netCents).toBe(1000);
    expect(b.dealer.cards.every((c: { rank: string }) => c.rank !== "?")).toBe(true);
  });

  it("cageHref points at the ledger section", () => {
    expect(cageHref("craps", "t 1")).toBe("/wallet?game=craps&ref=t%201#ledger");
  });
});
