import { withDbSync } from "@/lib/dbSync";
import { withUser, json } from "@/lib/http";
import { getDb } from "@/lib/db";
import { crapsRollBetLines, ledgerLines } from "@/lib/replay";

async function _GET(req: Request) {
  return withUser(req, async (user) => {
    const q = new URL(req.url).searchParams;
    const recent = ledgerLines(getDb(), user.id, { limit: 60 });
    const ref = q.get("ref") || undefined;
    const game = q.get("game") || undefined;
    const matched = ref ? ledgerLines(getDb(), user.id, { game, ref, limit: 20 }) : [];
    // A craps roll's own lines: its payout (by roll ref) plus the bets placed for that roll.
    if (ref && game === "craps") for (const l of crapsRollBetLines(getDb(), user.id, ref)) if (!matched.some((m) => m.id === l.id)) matched.push(l);
    return json({ recent, matched });
  });
}
export const GET = withDbSync(_GET);
export const dynamic = "force-dynamic";
