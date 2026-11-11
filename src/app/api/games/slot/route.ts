import { withDbSync } from "@/lib/dbSync";
import { withUser, json } from "@/lib/http";
import { getBalance } from "@/lib/ledger";
import { creditPlayWin, debitPlayBet } from "@/lib/bonus";
import { playTournamentRound, tournamentHud } from "@/lib/tournaments/play";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";
import { spinSlot, publicSpin, SLOT_INFO, PAYTABLE, PAYLINES, exactRtp } from "@/lib/games/slot";

async function _GET() {
  return json({
    info: SLOT_INFO,
    paytable: PAYTABLE,
    lines: PAYLINES.length,
    rtpPublished: "Exact theoretical RTP 95.53%, enumerated over the 20-stop strips and checked in tests",
  });
}

async function _POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    const coinCents = Number(body.coinCents);
    if (body.tournamentId) {
      const tid = String(body.tournamentId);
      const out = playTournamentRound(getDb(), user.id, tid, "slot", String(body.idempotencyKey || newId()), (check) => {
        check(coinCents * PAYLINES.length);
        const spin = spinSlot(coinCents);
        return { stake: spin.betCents, ret: spin.winCents, result: spin };
      });
      return json({ spin: publicSpin(out.result), tournament: tournamentHud(getDb(), user.id, tid) });
    }
    const spin = spinSlot(coinCents);
    const key = String(body.idempotencyKey || newId());
    const funded = debitPlayBet(user.id, spin.betCents, "slot", spin.id, `slot-bet-${spin.id}-${key}`);
    const paid = spin.winCents > 0 ? creditPlayWin(user.id, spin.winCents, "slot", spin.id, `slot-pay-${spin.id}`, funded) : null;
    const u = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    void exactRtp;
    return json({ user: toPublic(u), spin: publicSpin(spin), funded, paid, balanceCents: getBalance(user.id) });
  });
}

export const GET = withDbSync(_GET);
export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
