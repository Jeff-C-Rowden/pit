import { withDbSync } from "@/lib/dbSync";
import { json, err } from "@/lib/http";
import { getDb } from "@/lib/db";
import { serverNow } from "@/lib/clock";
import { ensureSchedule, tournamentDetail } from "@/lib/tournaments/store";
import { optionalUser } from "@/lib/tournaments/http";

async function _GET(req: Request, ctx: { params: { id: string } }) {
  const db = getDb();
  const now = serverNow();
  ensureSchedule(db, now);
  try {
    return json(tournamentDetail(db, ctx.params.id, now, optionalUser(req)?.id ?? null));
  } catch (e) {
    return err(e instanceof Error ? e.message : "not found", 404);
  }
}

export const GET = withDbSync(_GET);
export const dynamic = "force-dynamic";
