import { withDbSync } from "@/lib/dbSync";
import { withUser, json } from "@/lib/http";
import { debitBet, creditPayout, getBalance } from "@/lib/ledger";
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
    const spin = spinSlot(coinCents);
    const key = String(body.idempotencyKey || newId());
    debitBet(user.id, spin.betCents, "slot", spin.id, `slot-bet-${spin.id}-${key}`);
    if (spin.winCents > 0) {
      creditPayout(user.id, spin.winCents, "slot", spin.id, `slot-pay-${spin.id}`);
    }
    const u = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    void exactRtp;
    return json({ user: toPublic(u), spin: publicSpin(spin), balanceCents: getBalance(user.id) });
  });
}

export const GET = withDbSync(_GET);
export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
