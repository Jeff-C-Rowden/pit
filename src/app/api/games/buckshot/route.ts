import { withDbSync } from "@/lib/dbSync";
import { withUser, json } from "@/lib/http";
import { debitBet, creditPayout, getBalance } from "@/lib/ledger";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";
import { buckshotInfo, publicBuckshotSpin, spinBuckshot } from "@/lib/games/buckshot";

async function _GET() {
  return json({ info: buckshotInfo() });
}

async function _POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    const spin = spinBuckshot(body.coins, body.denomCents);
    const key = String(body.idempotencyKey || newId());
    debitBet(user.id, spin.betCents, "buckshot", spin.id, `buckshot-bet-${spin.id}-${key}`, { coins: spin.coins, denomCents: spin.denomCents });
    if (spin.winCents > 0) {
      creditPayout(user.id, spin.winCents, "buckshot", spin.id, `buckshot-pay-${spin.id}`, { kind: spin.kind });
    }
    const u = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({ user: toPublic(u), spin: publicBuckshotSpin(spin), balanceCents: getBalance(user.id) });
  });
}

export const GET = withDbSync(_GET);
export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
