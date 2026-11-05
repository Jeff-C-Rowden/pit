import { withDbSync } from "@/lib/dbSync";
import { withUser, json, err } from "@/lib/http";
import { getDb } from "@/lib/db";
import { toPublic } from "@/lib/auth";
import { limitView, requestLimit, cancelPending, PERIODS, type Limit, type Period } from "@/lib/limits";

function views(userId: string) {
  const db = getDb();
  return { deposit: limitView(db, userId, "deposit"), loss: limitView(db, userId, "loss") };
}
function parse(cents: unknown, period: unknown, label: string): Limit | string {
  if (cents === "" || cents == null) return null;
  if (!Number.isInteger(cents) || (cents as number) < 1000) return `${label} limit must be integer cents >= $10`;
  if (!PERIODS.includes(period as Period)) return `${label} limit needs a period: day, week or month`;
  return { cents: cents as number, period: period as Period };
}

async function _GET(req: Request) {
  return withUser(req, async (user) => json({ limits: views(user.id) }));
}

async function _POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    if (body.cancelPending !== undefined) {
      if (body.cancelPending !== "deposit" && body.cancelPending !== "loss") return err("cancelPending must be deposit or loss");
      cancelPending(getDb(), user.id, body.cancelPending);
      return json({ cancelled: body.cancelPending, limits: views(user.id) });
    }
    const dep = parse(body.depositLimitCents, body.depositPeriod, "deposit");
    const loss = parse(body.lossLimitCents, body.lossPeriod, "loss");
    if (typeof dep === "string") return err(dep);
    if (typeof loss === "string") return err(loss);
    const db = getDb();
    const result = db.transaction(() => ({
      deposit: requestLimit(db, user.id, "deposit", dep),
      loss: requestLimit(db, user.id, "loss", loss),
    }))();
    const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({ user: toPublic(fresh), result, limits: views(user.id) });
  });
}

export const GET = withDbSync(_GET);
export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
