import { withUser, json, err } from "@/lib/http";
import { debitBet, creditPayout, getBalance } from "@/lib/ledger";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";
import {
  spinAmerican, settleRoulette, validateBet, publicWheel, dozen, column,
  type RouletteBet,
} from "@/lib/games/roulette";

export async function GET() {
  return json(publicWheel());
}

export async function POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    type IncomingBet = RouletteBet & { which?: number };
    const raw = Array.isArray(body.bets) ? body.bets as IncomingBet[] : [];
    if (!raw.length) return err("place at least one bet");
    if (raw.length > 40) return err("too many bets");
    const bets: RouletteBet[] = raw.map((b) => {
      const bet: RouletteBet = {
        kind: b.kind,
        numbers: [...(b.numbers || [])].map(String),
        amountCents: Number(b.amountCents),
      };
      if (b.kind === "dozen") bet.numbers = dozen(Number(b.which) as 1 | 2 | 3);
      if (b.kind === "column") bet.numbers = column(Number(b.which) as 1 | 2 | 3);
      validateBet(bet);
      return bet;
    });
    const stake = bets.reduce((a, b) => a + b.amountCents, 0);
    const id = newId();
    const key = String(body.idempotencyKey || id);
    debitBet(user.id, stake, "roulette", id, `rl-bet-${id}-${key}`, { bets });
    const pocket = spinAmerican();
    const settled = settleRoulette(bets, pocket);
    if (settled.payoutCents > 0) {
      creditPayout(user.id, settled.payoutCents, "roulette", id, `rl-pay-${id}`);
    }
    const u = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({
      user: toPublic(u),
      spin: { id, ...settled, stakeCents: stake, netCents: settled.payoutCents - stake },
      balanceCents: getBalance(user.id),
    });
  });
}
