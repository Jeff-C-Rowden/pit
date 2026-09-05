import { applyLedger, getBalance } from "@/lib/ledger";
import { getPaymentsAdapter } from "@/lib/payments";
import { withUser, json, err } from "@/lib/http";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";

export async function POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    const amountCents = Number(body.amountCents);
    if (!Number.isInteger(amountCents) || amountCents < 1000) return err("minimum withdrawal is $10");
    if (amountCents > getBalance(user.id)) return err("insufficient funds");
    const pay = getPaymentsAdapter();
    const res = await pay.requestWithdrawal({ userId: user.id, amountCents });
    if (!res.ok) return err(res.error);
    const id = newId();
    applyLedger({
      userId: user.id,
      type: "withdrawal_hold",
      amountCents: -amountCents,
      ref: id,
      idempotencyKey: String(body.idempotencyKey || `wd-${id}`),
      meta: { adapter: pay.name, providerRef: res.providerRef, status: "pending" },
    });
    getDb().prepare("INSERT INTO withdrawals (id, user_id, amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?)").run(
      id, user.id, amountCents, "pending", new Date().toISOString()
    );
    const fresh = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({
      user: toPublic(fresh),
      withdrawal: { id, amountCents, status: "pending" },
      note: "Sandbox: funds are held pending. No live payout is sent.",
    });
  });
}

export async function GET(req: Request) {
  return withUser(req, async (user) => {
    const rows = getDb().prepare("SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(user.id);
    return json({ withdrawals: rows });
  });
}
