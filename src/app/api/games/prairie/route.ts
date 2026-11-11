import { withDbSync } from "@/lib/dbSync";
import { withUser, json } from "@/lib/http";
import { debitBet, creditPayout, getBalance } from "@/lib/ledger";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";
import { PRAIRIE_INFO, playPrairie, publicPrairieSpin } from "@/lib/games/prairie";
import { PRAIRIE_MATH } from "@/lib/gameMath";

async function _GET() {
  return json({ info: PRAIRIE_INFO, math: PRAIRIE_MATH, sandbox: true });
}

/**
 * One paid spin. The base grid, every coin value, every free spin and every Hold & Spin respin are
 * decided here, before anything is shown, and the whole return is credited in the same transaction.
 * Cash only (Bonus money stays on its own machines).
 */
async function _POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    const spin = playPrairie(Number(body.coinCents));
    const key = String(body.idempotencyKey || newId());
    const db = getDb();
    db.transaction(() => {
      debitBet(user.id, spin.betCents, "prairie", spin.id, `prairie-bet-${spin.id}-${key}`, { coinCents: spin.coinCents }, db);
      if (spin.winCents > 0) {
        creditPayout(user.id, spin.winCents, "prairie", spin.id, `prairie-pay-${spin.id}`, {
          baseWinCents: spin.baseWinCents,
          freeSpinsWinCents: spin.freeSpins?.totalWinCents ?? 0,
          freeSpins: spin.freeSpins?.spins.length ?? 0,
          holdWinCents: spin.hold?.totalWinCents ?? 0,
          holdCoins: spin.hold ? spin.hold.board.filter((v) => v !== null).length : 0,
        }, db);
      }
    })();
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({ user: toPublic(u), spin: publicPrairieSpin(spin), balanceCents: getBalance(user.id, db), sandbox: true });
  });
}

export const GET = withDbSync(_GET);
export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
