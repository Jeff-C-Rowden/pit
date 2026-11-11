import { withDbSync } from "@/lib/dbSync";
import { withUser, json } from "@/lib/http";
import { debitBet, creditPayout, getBalance } from "@/lib/ledger";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";
import { CLOVER_INFO, playClover, publicCloverSpin } from "@/lib/games/clover";
import { CLOVER_MATH } from "@/lib/gameMath";

async function _GET() {
  return json({ info: CLOVER_INFO, math: CLOVER_MATH, sandbox: true });
}

/**
 * One paid spin. The base grid, the Rainbow Wheel wedge(s) and every free spin are
 * decided here, before anything is shown, and the whole return is credited in the same transaction.
 * Cash only (Bonus money stays on its own machines).
 */
async function _POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    const spin = playClover(Number(body.coinCents));
    const key = String(body.idempotencyKey || newId());
    const db = getDb();
    db.transaction(() => {
      debitBet(user.id, spin.betCents, "clover", spin.id, `clover-bet-${spin.id}-${key}`, { coinCents: spin.coinCents }, db);
      if (spin.winCents > 0) {
        creditPayout(user.id, spin.winCents, "clover", spin.id, `clover-pay-${spin.id}`, {
          baseWinCents: spin.baseWinCents,
          freeSpinsWinCents: spin.freeSpins?.totalWinCents ?? 0,
          freeSpins: spin.freeSpins?.spins.length ?? 0,
          wheelInner: spin.wheel?.inner ?? null,
          wheelOuter: spin.wheel?.outer ?? null,
          wheelWinCents: spin.wheel?.totalWinCents ?? 0,
        }, db);
      }
    })();
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({ user: toPublic(u), spin: publicCloverSpin(spin), balanceCents: getBalance(user.id, db), sandbox: true });
  });
}

export const GET = withDbSync(_GET);
export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
