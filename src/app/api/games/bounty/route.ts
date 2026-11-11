import { withDbSync } from "@/lib/dbSync";
import { withUser, json } from "@/lib/http";
import { getBalance } from "@/lib/ledger";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";
import { BB_BOUNTY_TABLE, buckshotInfo, publicBuckshotSpin, spinBuckshot } from "@/lib/games/buckshot";
import { creditPlayWin, debitPlayBet } from "@/lib/bonus";
import { randInt } from "@/lib/rng";

/** Bounty Bars: a Bonus to Cash machine (bonus-funded winnings pay as cash), ~90% RTP. */
async function _GET() {
  return json({ info: buckshotInfo(BB_BOUNTY_TABLE, "Bounty Bars"), bonusToCash: true });
}

async function _POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    if (body.tournamentId) return json({ error: "Bounty Bars isn't part of any tournament." }, 400);
    const spin = spinBuckshot(body.coins, body.denomCents, randInt, BB_BOUNTY_TABLE);
    const key = String(body.idempotencyKey || newId());
    const funded = debitPlayBet(user.id, spin.betCents, "bounty", spin.id, `bounty-bet-${spin.id}-${key}`, { coins: spin.coins, denomCents: spin.denomCents });
    const paid = spin.winCents > 0 ? creditPlayWin(user.id, spin.winCents, "bounty", spin.id, `bounty-pay-${spin.id}`, funded, { kind: spin.kind }) : null;
    const u = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({ user: toPublic(u), spin: publicBuckshotSpin(spin), funded, paid, balanceCents: getBalance(user.id) });
  });
}

export const GET = withDbSync(_GET);
export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
