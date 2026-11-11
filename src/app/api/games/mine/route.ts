import { withDbSync } from "@/lib/dbSync";
import { withUser, json } from "@/lib/http";
import { debitBet, creditPayout, getBalance } from "@/lib/ledger";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";
import { MINE_INFO, playMine, publicMineSpin } from "@/lib/games/mine";
import { MINE_MATH } from "@/lib/gameMath";

async function _GET() {
  return json({ info: MINE_INFO, math: MINE_MATH, sandbox: true });
}

/**
 * One paid spin. The base grid, every free spin and the Mine Cart reveal order are all decided
 * here, before anything is shown, and the whole return is credited in the same transaction.
 * Cash only (Bonus money stays on its own machines).
 */
async function _POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    const spin = playMine(Number(body.coinCents));
    const key = String(body.idempotencyKey || newId());
    const db = getDb();
    db.transaction(() => {
      debitBet(user.id, spin.betCents, "mine", spin.id, `mine-bet-${spin.id}-${key}`, { coinCents: spin.coinCents }, db);
      if (spin.winCents > 0) {
        creditPayout(user.id, spin.winCents, "mine", spin.id, `mine-pay-${spin.id}`, {
          baseWinCents: spin.baseWinCents,
          freeSpinsWinCents: spin.freeSpins?.totalWinCents ?? 0,
          freeSpins: spin.freeSpins?.spins.length ?? 0,
          pickWinCents: spin.pick?.totalWinCents ?? 0,
          picks: spin.pick ? spin.pick.reveals.length : 0,
        }, db);
      }
    })();
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({ user: toPublic(u), spin: publicMineSpin(spin), balanceCents: getBalance(user.id, db), sandbox: true });
  });
}

export const GET = withDbSync(_GET);
export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
