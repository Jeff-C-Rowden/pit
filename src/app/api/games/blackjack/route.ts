import { withUser, json, err } from "@/lib/http";
import { debitBet, creditPayout, saveGame, loadGame, loadOpenGame, getBalance } from "@/lib/ledger";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";
import {
  startBlackjack, hit, stand, double, split, takeInsurance, publicBlackjack, type BjState,
} from "@/lib/games/blackjack";

function freshUser(id: string) {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export async function GET(req: Request) {
  return withUser(req, async (user) => {
    const open = loadOpenGame<BjState>(user.id, "blackjack");
    return json({
      user: toPublic(user),
      game: open ? publicBlackjack(open.state, false) : null,
      rules: {
        shoe: "6 decks",
        dealer: "stands on soft 17",
        blackjack: "pays 3:2",
        insurance: "2:1 when dealer shows ace",
        split: "once",
        double: "any two-card hand",
        houseEdge: "~0.5% with basic strategy (S17, 3:2, DAS, 6-deck)",
      },
    });
  });
}

export async function POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    const action = String(body.action || "");
    const key = String(body.idempotencyKey || newId());

    if (action === "deal") {
      const existing = loadOpenGame<BjState>(user.id, "blackjack");
      if (existing) return err("finish the hand on the felt first");
      const bet = Number(body.betCents);
      const state = startBlackjack(bet);
      debitBet(user.id, bet, "blackjack", state.id, `bj-bet-${state.id}-${key}`, { action: "deal" });
      const done = state.phase === "settled";
      if (done && (state.payoutCents || 0) > 0) {
        creditPayout(user.id, state.payoutCents!, "blackjack", state.id, `bj-pay-${state.id}`);
      }
      saveGame({ id: state.id, userId: user.id, game: "blackjack", status: done ? "settled" : "open", state });
      const u = freshUser(user.id) as typeof user;
      return json({ user: toPublic(u), game: publicBlackjack(state, done), balanceCents: getBalance(user.id) });
    }

    const id = String(body.gameId || "");
    const loaded = loadGame<BjState>(id, user.id);
    if (!loaded || loaded.status !== "open") return err("no open blackjack hand");
    let state = loaded.state;

    if (action === "insurance") {
      if (state.phase !== "insurance") return err("insurance not offered");
      const take = !!body.take;
      if (take) {
        const prem = Math.floor(state.playerHands[0]!.betCents / 2);
        debitBet(user.id, prem, "blackjack", state.id, `bj-ins-${state.id}-${key}`, { action: "insurance" });
      }
      state = takeInsurance(state, take);
    } else if (action === "hit") state = hit(state);
    else if (action === "stand") state = stand(state);
    else if (action === "double") {
      const r = double(state);
      debitBet(user.id, r.extraBet, "blackjack", state.id, `bj-dbl-${state.id}-${key}`, { action: "double" });
      state = r.state;
    } else if (action === "split") {
      const r = split(state);
      debitBet(user.id, r.extraBet, "blackjack", state.id, `bj-spl-${state.id}-${key}`, { action: "split" });
      state = r.state;
    } else return err("unknown action");

    const done = state.phase === "settled";
    if (done && (state.payoutCents || 0) > 0) {
      creditPayout(user.id, state.payoutCents!, "blackjack", state.id, `bj-pay-${state.id}`);
    }
    saveGame({ id: state.id, userId: user.id, game: "blackjack", status: done ? "settled" : "open", state });
    const u = freshUser(user.id) as typeof user;
    return json({ user: toPublic(u), game: publicBlackjack(state, done), balanceCents: getBalance(user.id) });
  });
}
