import { withUser, json, err } from "@/lib/http";
import { debitBet, loadGame, loadOpenGame, getBalance } from "@/lib/ledger";
import { persistHoldem, holdemDone } from "@/lib/holdemPersist";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";
import { startHoldem, playerAct, publicHoldem, type HoldemState, type PlayerAction, SB, BB } from "@/lib/games/holdem";

function freshUser(id: string) {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export async function GET(req: Request) {
  return withUser(req, async (user) => {
    const open = loadOpenGame<HoldemState>(user.id, "holdem");
    if (open && holdemDone(open.state)) {
      persistHoldem(user.id, open.state);
      user = freshUser(user.id) as typeof user;
    }
    const still = loadOpenGame<HoldemState>(user.id, "holdem");
    const gameState = still?.state ?? (open && holdemDone(open.state) ? open.state : null);
    return json({
      user: toPublic(user),
      game: gameState ? publicHoldem(gameState) : null,
      blinds: { sb: SB, bb: BB },
      rules: "Heads-up NLHE vs the house. Button posts SB. No limit. Standard ranking. Blinds $1 / $2.",
    });
  });
}

export async function POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    const action = String(body.action || "");
    const key = String(body.idempotencyKey || newId());

    if (action === "deal") {
      const existing = loadOpenGame<HoldemState>(user.id, "holdem");
      if (existing) return err("finish this hand first");
      const last = getDb().prepare(
        `SELECT state_json FROM game_states WHERE user_id = ? AND game = 'holdem' ORDER BY created_at DESC LIMIT 1`
      ).get(user.id) as { state_json: string } | undefined;
      const lastBtn = last ? !!(JSON.parse(last.state_json) as HoldemState).buttonIsPlayer : true;
      const { state, playerBlind } = startHoldem(!lastBtn);
      debitBet(user.id, playerBlind, "holdem", state.id, `he-blind-${state.id}-${key}`);
      persistHoldem(user.id, state);
      const u = freshUser(user.id) as typeof user;
      return json({ user: toPublic(u), game: publicHoldem(state), balanceCents: getBalance(user.id) });
    }

    const loaded = loadGame<HoldemState>(String(body.gameId || ""), user.id);
    if (!loaded || loaded.status !== "open") return err("no open hold'em hand");
    let act: PlayerAction;
    if (action === "fold") act = { type: "fold" };
    else if (action === "check") act = { type: "check" };
    else if (action === "call") act = { type: "call" };
    else if (action === "bet" || action === "raise") act = { type: action, amountCents: Number(body.amountCents) };
    else return err("unknown action");
    const r = playerAct(loaded.state, act);
    if (r.extraDebit > 0) {
      debitBet(user.id, r.extraDebit, "holdem", loaded.state.id, `he-${action}-${loaded.state.id}-${key}`);
    }
    persistHoldem(user.id, loaded.state);
    const u = freshUser(user.id) as typeof user;
    return json({ user: toPublic(u), game: publicHoldem(loaded.state), balanceCents: getBalance(user.id) });
  });
}
