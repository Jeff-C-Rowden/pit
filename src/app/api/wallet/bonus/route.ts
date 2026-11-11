import { withDbSync } from "@/lib/dbSync";
import { withUser, json, err } from "@/lib/http";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getPaymentsAdapter } from "@/lib/payments";
import { grantTestBonus } from "@/lib/bonus";
import { chicagoDay } from "@/lib/dailyClaim";
import { serverNow } from "@/lib/clock";

/** Sandbox only: $5 of play-only test bonus once per Chicago day, so bonus play can be tried. */
async function _POST(req: Request) {
  return withUser(req, async (user) => {
    if (getPaymentsAdapter().mode !== "sandbox") return err("test bonus is sandbox-only");
    const db = getDb();
    const day = chicagoDay(serverNow());
    const already = !!db.prepare("SELECT 1 FROM ledger WHERE idempotency_key = ?").get(`test-bonus-${user.id}-${day}`);
    const row = grantTestBonus(user.id, day, db);
    const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({ user: toPublic(fresh), amountCents: row.amount_cents, already, sandbox: true });
  });
}

export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
