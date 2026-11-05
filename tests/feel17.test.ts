import { describe, it, expect } from "vitest";
import { celebrationLevel, crapsRiskedCents, holdemRiskedCents, vibratePattern } from "../src/lib/feel";
import { resetDbForTests } from "../src/lib/db";
import { debitBet, creditPayout } from "../src/lib/ledger";
import { recordSpin, lastSettledSpin } from "../src/lib/games/roulette";
import { startHoldem, publicHoldem } from "../src/lib/games/holdem";

describe("stake-aware effects for Craps and Hold'em", () => {
  it("craps risk is the whole layout on the roll", () => {
    expect(crapsRiskedCents([{ amount: 500 }, { amount: 1000 }])).toBe(1500);
    expect(crapsRiskedCents([])).toBe(0);
    // $15 down, $20 back: profit below the stake, so no celebration
    expect(celebrationLevel(crapsRiskedCents([{ amount: 500 }, { amount: 1000 }]), 2000)).toBe(0);
    // $5 any seven paying 4:1 returns $25: level 1
    expect(celebrationLevel(crapsRiskedCents([{ amount: 500 }]), 2500)).toBe(1);
  });
  it("hold'em risk comes from the server's committed amount", () => {
    expect(holdemRiskedCents({ playerCommittedCents: 400 })).toBe(400);
    expect(holdemRiskedCents(null)).toBe(0);
    expect(celebrationLevel(holdemRiskedCents({ playerCommittedCents: 400 }), 800)).toBe(1);
    expect(celebrationLevel(holdemRiskedCents({}), 800)).toBe(0);
  });
  it("public hold'em state reports what the player committed", () => {
    const { state: s } = startHoldem(true);
    expect(publicHoldem(s).playerCommittedCents).toBeGreaterThan(0);
  });
});

describe("vibration scaling", () => {
  it("never buzzes for a level-0 result; grows with the level", () => {
    expect(vibratePattern("pay", 0)).toEqual([]);
    expect(vibratePattern("pay", 1).length).toBe(1);
    expect(vibratePattern("pay", 3).length).toBeGreaterThan(vibratePattern("pay", 2).length);
    expect(vibratePattern("chip")).toEqual([8]);
  });
});

describe("roulette replay reads the ledger", () => {
  it("returns the last spin with stake and payout from ledger rows", () => {
    const db = resetDbForTests();
    db.prepare(`INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, created_at)
      VALUES ('u1','u1@pit.test','h','T',1,0,0,datetime('now'))`).run();
    db.prepare(`UPDATE users SET balance_cents = 10000 WHERE id='u1'`).run();
    expect(lastSettledSpin(db, "u1")).toBeNull();
    debitBet("u1", 1000, "roulette", "s1", "k1", undefined, db);
    creditPayout("u1", 36000, "roulette", "s1", "p1", undefined, db);
    recordSpin(db, { id: "s1", userId: "u1", pocket: "17", stakeCents: 1000, payoutCents: 36000 });
    const last = lastSettledSpin(db, "u1")!;
    expect(last).toMatchObject({ id: "s1", pocket: "17", stakeCents: 1000, payoutCents: 36000, netCents: 35000 });
  });
});
