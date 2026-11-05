import { describe, it, expect } from "vitest";
import { blackjackResultLabel, paigowResultLabel } from "@/lib/feel";
import { groupByDay } from "@/lib/ledgerDays";

describe("round 19 labels", () => {
  it("capitalises blackjack results", () => {
    expect(blackjackResultLabel("win")).toBe("You win");
    expect(blackjackResultLabel("lose / dealer bust")).toContain(" · ");
    expect(blackjackResultLabel("push")[0]).toBe("P");
  });
  it("pai gow headlines", () => {
    expect(paigowResultLabel("win both · x")).toBe("You won both hands");
    expect(paigowResultLabel("push · high you")).toMatch(/^Push/);
  });
});

describe("ledger day groups", () => {
  it("splits play net from cash moves per local day", () => {
    const now = new Date(2026, 10, 4, 12);
    const t = (d: number, h: number) => new Date(2026, 10, d, h).toISOString();
    const g = groupByDay([
      { at: t(4, 11), type: "payout", amountCents: 1000 },
      { at: t(4, 10), type: "bet", amountCents: -500 },
      { at: t(4, 9), type: "deposit", amountCents: 2000 },
      { at: t(3, 9), type: "bet", amountCents: -100 },
    ], now);
    expect(g.map((x) => x.label)).toEqual(["Today", "Yesterday"]);
    expect(g[0].playNet).toBe(500); expect(g[0].cashIn).toBe(2000); expect(g[1].playNet).toBe(-100);
  });
});

import { resetDbForTests } from "../src/lib/db";
import { debitBet, creditPayout } from "../src/lib/ledger";
import { crapsRollBetLines, recentResults, lastPaigow, lastHoldem } from "../src/lib/replay";

function setup() {
  const db = resetDbForTests();
  db.prepare(`INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, created_at)
    VALUES ('u1','u1@pit.test','h','T',1,0,10000,datetime('now'))`).run();
  return db;
}

describe("round 19 ledger reads", () => {
  it("craps roll bet lines and recent strip", () => {
    const db = setup();
    const b = debitBet("u1", 500, "craps", "t1", "a", undefined, db);
    creditPayout("u1", 1000, "craps", "t1-1", "c1", undefined, db);
    const ids = (db.prepare("SELECT id FROM ledger WHERE ref='t1'").all() as any[]).map((r) => r.id);
    const rec = { ref: "t1-1", dice: [3, 4], riskedCents: 500, at: "x", betLineIds: ids };
    db.prepare(`INSERT INTO game_states (id, user_id, game, status, state_json, created_at, updated_at) VALUES ('t1','u1','craps','open',?,datetime('now'),datetime('now'))`).run(JSON.stringify({ id: "t1", lastRollRecord: rec, rollLog: [rec] }));
    expect(crapsRollBetLines(db, "u1", "t1-1").map((l: any) => l.amountCents)).toEqual([-500]);
    const r = recentResults(db, "u1", "craps", 5);
    expect(r[0].label).toBe("7"); expect(r[0].paidCents).toBe(1000); expect(r[0].netCents).toBeNull();
    void b;
  });
  it("pai gow / hold'em replay is null with no settled stake", () => {
    const db = setup();
    expect(lastPaigow(db, "u1")).toBeNull();
    expect(lastHoldem(db, "u1")).toBeNull();
    expect(recentResults(db, "u1", "blackjack", 5)).toEqual([]);
  });
});
