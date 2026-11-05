import { withDbSync } from "@/lib/dbSync";
import { withUser, json, err } from "@/lib/http";
import { getDb } from "@/lib/db";
import { serverNow } from "@/lib/clock";
import { claimDaily, dailyStatus } from "@/lib/dailyClaim";
import { getPaymentsAdapter } from "@/lib/payments";
import { toPublic } from "@/lib/auth";

async function _GET(req: Request) {
  return withUser(req, async (user) => json(dailyStatus(getDb(), user.id, serverNow())));
}

async function _POST(req: Request) {
  return withUser(req, async (user) => {
    if (getPaymentsAdapter().mode !== "sandbox") return err("free sandbox chips are only available in sandbox mode");
    const r = claimDaily(getDb(), user.id, serverNow());
    if (!r.ok) return json({ error: r.message, code: r.code, ...r.status }, 409);
    const fresh = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({ ...r.status, user: toPublic(fresh), amountCents: r.amountCents, balanceCents: r.balanceCents, sandbox: true });
  });
}

export const GET = withDbSync(_GET);
export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
