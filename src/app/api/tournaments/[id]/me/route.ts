import { withDbSync } from "@/lib/dbSync";
import { withUser, json } from "@/lib/http";
import { getDb } from "@/lib/db";
import { serverNow } from "@/lib/clock";
import { ensureSchedule } from "@/lib/tournaments/store";
import { tournamentHud } from "@/lib/tournaments/play";

async function _GET(req: Request, ctx: { params: { id: string } }) {
  return withUser(req, async (user) => {
    const db = getDb();
    ensureSchedule(db, serverNow());
    return json({ tournament: tournamentHud(db, user.id, ctx.params.id) });
  });
}

export const GET = withDbSync(_GET);
export const dynamic = "force-dynamic";
