import { withDbSync } from "@/lib/dbSync";
import { withUser, json, err } from "@/lib/http";
import { getDb } from "@/lib/db";
import { lastBlackjack, lastCrapsRoll, lastRoulette } from "@/lib/replay";

async function _GET(req: Request) {
  return withUser(req, async (user) => {
    const game = new URL(req.url).searchParams.get("game");
    const db = getDb();
    const last = game === "blackjack" ? lastBlackjack(db, user.id) : game === "craps" ? lastCrapsRoll(db, user.id) : game === "roulette" ? lastRoulette(db, user.id) : undefined;
    if (last === undefined) return err("unknown game");
    return json({ last, note: "Replay of a result that already settled. Nothing moves." });
  });
}
export const GET = withDbSync(_GET);
export const dynamic = "force-dynamic";
