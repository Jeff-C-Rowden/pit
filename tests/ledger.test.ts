import { describe, it, expect, beforeEach } from "vitest";
import { resetDbForTests } from "../src/lib/db";
import { applyLedger, debitBet, creditPayout, getBalance, LedgerError } from "../src/lib/ledger";

function seed(id = "u1") {
  const db = resetDbForTests();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, created_at)
     VALUES (?, ?, 'hash', ?, 1, 0, 0, datetime('now'))`
  ).run(id, `${id}@pit.test`, "Tester");
  return id;
}

describe("ledger", () => {
  beforeEach(() => { seed(); });

  it("credits deposits and is idempotent", () => {
    applyLedger({ userId: "u1", type: "deposit", amountCents: 10000, idempotencyKey: "d1" });
    applyLedger({ userId: "u1", type: "deposit", amountCents: 10000, idempotencyKey: "d1" });
    expect(getBalance("u1")).toBe(10000);
  });

  it("debits bets before any win and rejects overdraft", () => {
    applyLedger({ userId: "u1", type: "deposit", amountCents: 500, idempotencyKey: "d2" });
    debitBet("u1", 500, "slot", "g1", "b1");
    expect(getBalance("u1")).toBe(0);
    expect(() => debitBet("u1", 1, "slot", "g2", "b2")).toThrow(LedgerError);
  });

  it("credits payouts after a debit; replayed payout key does not print extra money", () => {
    applyLedger({ userId: "u1", type: "deposit", amountCents: 1000, idempotencyKey: "d3" });
    debitBet("u1", 1000, "blackjack", "h1", "bet1");
    creditPayout("u1", 2500, "blackjack", "h1", "pay1");
    creditPayout("u1", 2500, "blackjack", "h1", "pay1");
    expect(getBalance("u1")).toBe(2500);
  });

  it("isolates two users", () => {
    const db = resetDbForTests();
    const mk = (id: string) =>
      db.prepare(
        `INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, created_at)
         VALUES (?, ?, 'x', ?, 1, 0, 0, datetime('now'))`
      ).run(id, `${id}@x.test`, id);
    mk("a"); mk("b");
    applyLedger({ userId: "a", type: "deposit", amountCents: 5000, idempotencyKey: "aa" });
    applyLedger({ userId: "b", type: "deposit", amountCents: 1000, idempotencyKey: "bb" });
    debitBet("a", 2000, "slot", "s", "ab");
    expect(getBalance("a")).toBe(3000);
    expect(getBalance("b")).toBe(1000);
  });

  it("enforces deposit limits", () => {
    const db = resetDbForTests();
    db.prepare(
      `INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, deposit_limit_cents, created_at)
       VALUES ('u1','u1@x.test','x','t',1,0,0,1000,datetime('now'))`
    ).run();
    expect(() => applyLedger({ userId: "u1", type: "deposit", amountCents: 1001, idempotencyKey: "over" })).toThrow(/deposit/i);
  });
});
