import { withDbSync } from "@/lib/dbSync";
import { json } from "@/lib/http";
import { getDb } from "@/lib/db";
import { serverNow } from "@/lib/clock";
import { ensureSchedule, listTournaments, type Tab } from "@/lib/tournaments/store";
import { optionalUser } from "@/lib/tournaments/http";

async function _GET(req: Request) {
  const db = getDb();
  const now = serverNow();
  ensureSchedule(db, now);
  const q = new URL(req.url).searchParams;
  const tab = (["live", "upcoming", "finished"].includes(q.get("tab") || "") ? q.get("tab") : "live") as Tab;
  const user = optionalUser(req);
  return json({ tab, serverNow: now.toISOString(), tournaments: listTournaments(db, now, tab, user?.id ?? null), signedIn: !!user });
}

export const GET = withDbSync(_GET);
export const dynamic = "force-dynamic";
