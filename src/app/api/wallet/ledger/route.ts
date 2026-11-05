import { withDbSync } from "@/lib/dbSync";
import { withUser, json } from "@/lib/http";
import { getDb } from "@/lib/db";
import { ledgerLines } from "@/lib/replay";

async function _GET(req: Request) {
  return withUser(req, async (user) => {
    const q = new URL(req.url).searchParams;
    const recent = ledgerLines(getDb(), user.id, { limit: 25 });
    const ref = q.get("ref") || undefined;
    const game = q.get("game") || undefined;
    const matched = ref ? ledgerLines(getDb(), user.id, { game, ref, limit: 20 }) : [];
    return json({ recent, matched });
  });
}
export const GET = withDbSync(_GET);
export const dynamic = "force-dynamic";
