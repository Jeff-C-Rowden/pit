import { withDbSync } from "@/lib/dbSync";
import { withUser, err } from "@/lib/http";
import { getDb } from "@/lib/db";
import { bestsMachine, personalBestsFor } from "@/lib/personalBests";

/**
 * SS4: GET /api/bests?game=slot — the signed-in player's own "Your bests" for one machine,
 * derived from their ledger rows only. Private: there is no way to ask for anyone else's,
 * and nothing here is ranked or compared.
 */
async function _GET(req: Request) {
  return withUser(req, async (user) => {
    const game = new URL(req.url).searchParams.get("game") || "";
    const machine = bestsMachine(game);
    if (!machine) return err("unknown machine", 404);
    const bests = personalBestsFor(getDb(), user.id, machine);
    return Response.json({ bests, sandbox: true, private: true }, { headers: { "cache-control": "private, no-store" } });
  });
}

export const GET = withDbSync(_GET);
export const dynamic = "force-dynamic";
