import { withDbSync } from "@/lib/dbSync";
import { withUser, json } from "@/lib/http";
import { getDb } from "@/lib/db";
import { recentSpins, lastSettledSpin, HISTORY_LIMIT } from "@/lib/games/roulette";

async function _GET(req: Request) {
  return withUser(req, async (user) => json({
    pockets: recentSpins(getDb(), user.id, HISTORY_LIMIT),
    last: lastSettledSpin(getDb(), user.id),
    note: "Past results only. Every spin is independent; history does not predict the next number.",
  }));
}

export const GET = withDbSync(_GET);
export const dynamic = "force-dynamic";
