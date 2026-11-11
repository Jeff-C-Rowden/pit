import { withDbSync } from "@/lib/dbSync";
import { json } from "@/lib/http";
import { getDb } from "@/lib/db";
import { serverNow } from "@/lib/clock";
import { ensureSchedule } from "@/lib/tournaments/store";
import { cronAuthorized, pruneRounds, houseBookSummary } from "@/lib/tournaments/cron";

/** Daily Vercel cron backstop (Hobby: once a day). Lazy evaluation on visits does the rest. */
async function _GET(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) return json({ error: "unauthorized" }, 401);
  const db = getDb();
  const now = serverNow();
  let created = 0, transitions = 0;
  for (let i = 0; i < 50; i++) {
    const r = ensureSchedule(db, now, 200);
    created += r.created; transitions += r.transitions;
    if (!r.created && !r.transitions) break;
  }
  const pruned = pruneRounds(db, now);
  const book = houseBookSummary(db, now);
  console.log(`[pit] tournaments cron: created ${created}, transitions ${transitions}, pruned ${pruned} rounds, house book ${JSON.stringify(book)}`);
  return json({ ok: true, created, transitions, pruned, book });
}

export const GET = withDbSync(_GET);
export const dynamic = "force-dynamic";
