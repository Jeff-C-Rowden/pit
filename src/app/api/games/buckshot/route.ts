import { withDbSync } from "@/lib/dbSync";
import { withUser, json } from "@/lib/http";
import { getBalance } from "@/lib/ledger";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";
import { buckshotInfo, publicBuckshotSpin, spinBuckshot } from "@/lib/games/buckshot";
import { creditPlayWin, debitPlayBet } from "@/lib/bonus";
import { playTournamentRound, tournamentHud } from "@/lib/tournaments/play";

async function _GET() {
  return json({ info: buckshotInfo() });
}

async function _POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    if (body.tournamentId) {
      // Tournament round: same engine and strips; only the tournament stack moves. Bonus is never used.
      const tid = String(body.tournamentId);
      const out = playTournamentRound(getDb(), user.id, tid, "buckshot", String(body.idempotencyKey || newId()), (check) => {
        const spin = spinBuckshot(body.coins, body.denomCents);
        check(spin.betCents);
        return { stake: spin.betCents, ret: spin.winCents, summary: spin.line.join(","), result: spin };
      });
      return json({ spin: publicBuckshotSpin(out.result), tournament: tournamentHud(getDb(), user.id, tid) });
    }
    const spin = spinBuckshot(body.coins, body.denomCents);
    const key = String(body.idempotencyKey || newId());
    const funded = debitPlayBet(user.id, spin.betCents, "buckshot", spin.id, `buckshot-bet-${spin.id}-${key}`, { coins: spin.coins, denomCents: spin.denomCents });
    const paid = spin.winCents > 0 ? creditPlayWin(user.id, spin.winCents, "buckshot", spin.id, `buckshot-pay-${spin.id}`, funded, { kind: spin.kind }) : null;
    const u = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({ user: toPublic(u), spin: publicBuckshotSpin(spin), funded, paid, balanceCents: getBalance(user.id) });
  });
}

export const GET = withDbSync(_GET);
export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
