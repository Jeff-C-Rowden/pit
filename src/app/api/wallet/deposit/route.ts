import { applyLedger, getBalance } from "@/lib/ledger";
import { getPaymentsAdapter } from "@/lib/payments";
import { withUser, json, err } from "@/lib/http";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";

const SANDBOX_AMOUNTS = [1000, 2500, 5000, 10000, 25000, 50000, 100000];

export async function POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    const amountCents = Number(body.amountCents);
    const pay = getPaymentsAdapter();

    // Partner / non-sandbox: never take the sandbox_test_funds path.
    if (pay.mode !== "sandbox") {
      const res = await pay.deposit({
        userId: user.id,
        amountCents: Number.isFinite(amountCents) ? amountCents : 0,
        source: "partner",
      });
      if (!res.ok) {
        return err(
          res.error ||
            "partner checkout not available — sandbox test funds are disabled in partner mode"
        );
      }
      // A real partner client would redirect to checkout; stub never ok's.
      return err("partner deposit session not configured");
    }

    if (!SANDBOX_AMOUNTS.includes(amountCents)) {
      return err("choose a sandbox amount: $10, $25, $50, $100, $250, $500, or $1,000");
    }

    const res = await pay.deposit({
      userId: user.id,
      amountCents,
      source: "sandbox_test_funds",
    });
    if (!res.ok) return err(res.error);

    const key = String(body.idempotencyKey || `dep-${user.id}-${newId()}`);
    applyLedger({
      userId: user.id,
      type: "deposit",
      amountCents,
      idempotencyKey: key,
      meta: { adapter: pay.name, providerRef: res.providerRef, sandbox: true },
    });
    const fresh = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({ user: toPublic(fresh), balanceCents: getBalance(user.id), sandbox: true });
  });
}
