import { withDbSync } from "@/lib/dbSync";
import { withUser, json } from "@/lib/http";
import { getDb } from "@/lib/db";
import { toPublic } from "@/lib/auth";
import { serverNow } from "@/lib/clock";
import { ensureSchedule, rebuyEntry, tournamentDetail } from "@/lib/tournaments/store";

async function _POST(req: Request, ctx: { params: { id: string } }) {
  return withUser(req, async (user) => {
    const db = getDb();
    const now = serverNow();
    ensureSchedule(db, now);
    rebuyEntry(db, user.id, ctx.params.id, now);
    const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({ user: toPublic(fresh), ...tournamentDetail(db, ctx.params.id, now, user.id) });
  });
}

export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
