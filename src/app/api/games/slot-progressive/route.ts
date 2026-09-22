import { withUser, json } from "@/lib/http";
import { debitBet, creditPayout, getBalance } from "@/lib/ledger";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";
import {
  spinVaultSpire,
  publicVsSpin,
  VAULT_SPIRE_INFO,
  VS_PAYTABLE,
  VS_PAYLINES,
} from "@/lib/games/slotProgressive";
import { applyProgressiveSpin, getAllProgressives, publicMeters } from "@/lib/progressive";

export async function GET() {
  const meters = getAllProgressives();
  return json({
    info: VAULT_SPIRE_INFO,
    paytable: VS_PAYTABLE,
    lines: VS_PAYLINES.length,
    meters: publicMeters(meters),
    rtpPublished: VAULT_SPIRE_INFO.rtpNote,
  });
}

export async function POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    const coinCents = Number(body.coinCents);
    const spin = spinVaultSpire(coinCents);
    const key = String(body.idempotencyKey || newId());

    const db = getDb();
    const outcome = db.transaction(() => {
      // Full coin-in debited first. Progressive contribution (300 bps) is a
      // share of this bet — not an extra debit — applied to the four meters next.
      debitBet(
        user.id,
        spin.betCents,
        "vault-spire",
        spin.id,
        `vault-bet-${spin.id}-${key}`,
        { contributionCents: spin.contributionCents, contributionByTier: spin.contributionByTier },
        db,
      );

      const prog = applyProgressiveSpin({ contributionByTier: spin.contributionByTier }, db);
      const winCents = spin.lineWinCents + prog.progressiveAwardCents;
      if (winCents > 0) {
        creditPayout(
          user.id,
          winCents,
          "vault-spire",
          spin.id,
          `vault-pay-${spin.id}`,
          {
            lineWinCents: spin.lineWinCents,
            progressiveAwardCents: prog.progressiveAwardCents,
            progressiveHits: prog.hits,
          },
          db,
        );
      }
      return { prog, winCents };
    })();

    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({
      user: toPublic(u),
      spin: publicVsSpin({
        ...spin,
        progressiveHits: outcome.prog.hits,
        progressiveAwardCents: outcome.prog.progressiveAwardCents,
        metersAfter: publicMeters(outcome.prog.metersAfter),
        winCents: outcome.winCents,
      }),
      meters: publicMeters(getAllProgressives(db)),
      balanceCents: getBalance(user.id, db),
    });
  });
}
