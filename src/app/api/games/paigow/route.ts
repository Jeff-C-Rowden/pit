import { withUser, json, err } from "@/lib/http";
import { debitBet, creditPayout, saveGame, loadGame, loadOpenGame, getBalance } from "@/lib/ledger";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";
import { startPaiGow, setHands, setHouseWayPlayer, publicPaiGow, type PaiGowState } from "@/lib/games/paigow";

export async function GET(req: Request) {
  return withUser(req, async (user) => {
    const open = loadOpenGame<PaiGowState>(user.id, "paigow");
    return json({
      user: toPublic(user),
      game: open ? publicPaiGow(open.state) : null,
      rules: "House banks. Split 7 cards into 5-card high and 2-card low. Both must beat the dealer. Copies to the banker. 5% commission on player wins. Joker is ace or completes a straight/flush.",
    });
  });
}

export async function POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    const action = String(body.action || "");
    const key = String(body.idempotencyKey || newId());

    if (action === "deal") {
      if (loadOpenGame(user.id, "paigow")) return err("set your hand first");
      const bet = Number(body.betCents);
      const state = startPaiGow(bet);
      debitBet(user.id, bet, "paigow", state.id, `pg-bet-${state.id}-${key}`);
      saveGame({ id: state.id, userId: user.id, game: "paigow", status: "open", state });
      const u = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
      return json({ user: toPublic(u), game: publicPaiGow(state), balanceCents: getBalance(user.id) });
    }

    const loaded = loadGame<PaiGowState>(String(body.gameId || ""), user.id);
    if (!loaded || loaded.status !== "open") return err("no open pai gow hand");
    let state = loaded.state;
    if (action === "houseway") state = setHouseWayPlayer(state);
    else if (action === "set") state = setHands(state, body.high as number[], body.low as number[]);
    else return err("unknown action");
    if (state.phase === "settled" && (state.payoutCents || 0) > 0) {
      creditPayout(user.id, state.payoutCents!, "paigow", state.id, `pg-pay-${state.id}`);
    }
    saveGame({ id: state.id, userId: user.id, game: "paigow", status: state.phase === "settled" ? "settled" : "open", state });
    const u = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({ user: toPublic(u), game: publicPaiGow(state), balanceCents: getBalance(user.id) });
  });
}
