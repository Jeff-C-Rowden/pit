import { withDbSync } from "@/lib/dbSync";
import { withUser, json } from "@/lib/http";
import { getDb } from "@/lib/db";
import { refillStatus } from "@/lib/refill";

async function _GET(req: Request) {
  return withUser(req, async (user) => json(refillStatus(getDb(), user.id)));
}
export const GET = withDbSync(_GET);
export const dynamic = "force-dynamic";
