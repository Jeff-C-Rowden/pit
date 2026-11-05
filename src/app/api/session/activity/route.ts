import { withDbSync } from "@/lib/dbSync";
import { withUser, json } from "@/lib/http";
import { getDb } from "@/lib/db";
import { serverNow } from "@/lib/clock";
import { sessionActivity } from "@/lib/session";

async function _GET(req: Request) { return withUser(req, async (u) => json(sessionActivity(getDb(), u.id, serverNow()))); }
export const GET = withDbSync(_GET);
export const dynamic = "force-dynamic";
