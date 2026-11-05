import { describe, it, expect } from "vitest";
import { resetDbForTests } from "../src/lib/db";
import { applyLedger, debitBet } from "../src/lib/ledger";
import { refillStatus } from "../src/lib/refill";

function mk(dep: number | null, loss: number | null) {
  const db = resetDbForTests();
  db.prepare(`INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, created_at)
    VALUES ('u1','u1@pit.test','h','T',1,0,0,datetime('now'))`).run();
  db.prepare("UPDATE users SET deposit_limit_cents=?, loss_limit_cents=? WHERE id='u1'").run(dep, loss);
  return db;
}
describe("refillStatus with real limits", () => {
  it("no limits offers $100", () => {
    expect(refillStatus(mk(null, null), "u1")).toEqual({ ok: true, amountCents: 10000 });
  });
  it("partial room offers the largest fitting sandbox amount", () => {
    const db = mk(13000, null);
    applyLedger({ userId: "u1", type: "deposit", amountCents: 10000, idempotencyKey: "d1" }, db);
    const s = refillStatus(db, "u1");
    expect(s).toMatchObject({ ok: true, amountCents: 2500 });
    expect((s as any).note).toMatch(/deposit limit/);
  });
  it("deposit limit used up blocks with no button", () => {
    const db = mk(10500, null);
    applyLedger({ userId: "u1", type: "deposit", amountCents: 10000, idempotencyKey: "d1" }, db);
    expect(refillStatus(db, "u1")).toMatchObject({ ok: false, reason: "deposit_limit" });
  });
  it("loss limit reached blocks even with deposit room", () => {
    const db = mk(null, 1000);
    applyLedger({ userId: "u1", type: "deposit", amountCents: 1000, idempotencyKey: "d1" }, db);
    debitBet("u1", 1000, "slot", "r1", "b1", undefined, db);
    expect(refillStatus(db, "u1")).toMatchObject({ ok: false, reason: "loss_limit" });
  });
});
