import { withDbSync } from "@/lib/dbSync";
import { withUser, json, err } from "@/lib/http";
import { getDb } from "@/lib/db";
import { lastBlackjack, lastCrapsRoll, lastHoldem, lastPaigow, lastRoulette, recentResults } from "@/lib/replay";

async function _GET(req: Request) {
  return withUser(req, async (user) => {
    const q = new URL(req.url).searchParams;
    const game = q.get("game") || "";
    const db = getDb();
    if (!["blackjack", "craps", "roulette", "paigow", "holdem"].includes(game)) return err("unknown game");
    if (q.get("recent")) return json({ recent: recentResults(db, user.id, game, Number(q.get("recent")) || 5) });
    const fns: Record<string, (d: typeof db, u: string) => unknown> = { blackjack: lastBlackjack, craps: lastCrapsRoll, roulette: lastRoulette, paigow: lastPaigow, holdem: lastHoldem };
    const last = fns[game](db, user.id);
    return json({ last, note: "Replay of a result that already settled. Nothing moves." });
  });
}
export const GET = withDbSync(_GET);
export const dynamic = "force-dynamic";
