import { withUser, json, err } from "@/lib/http";
import { debitBet, creditPayout, applyLedger, saveGame, loadOpenGame, getBalance } from "@/lib/ledger";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";
import {
  newCrapsTable, applyBet, rollDice, resolveRoll, publicCraps,
  rememberChip, takeRoundSnapshot, undoLastChip, repeatPlan, lockCurrentLayout,
  type CrapsState, type PlaceAction,
} from "@/lib/games/craps";

function table(userId: string): { id: string; state: CrapsState } {
  const open = loadOpenGame<CrapsState>(userId, "craps");
  if (open) {
    if (!open.state.pendingChips) open.state.pendingChips = [];
    if (!open.state.lastRound) open.state.lastRound = [];
    if (open.state.alwaysRepeat == null) open.state.alwaysRepeat = false;
    return { id: open.id, state: open.state };
  }
  const state = newCrapsTable();
  saveGame({ id: state.id, userId, game: "craps", status: "open", state });
  return { id: state.id, state };
}

function save(userId: string, t: { id: string; state: CrapsState }) {
  saveGame({ id: t.id, userId, game: "craps", status: "open", state: t.state });
}

function applyRepeat(
  userId: string,
  t: { id: string; state: CrapsState },
  key: string,
  pattern?: PlaceAction[],
) {
  const placed: PlaceAction[] = [];
  let placedCents = 0;
  const run = (bets: PlaceAction[]) => {
    for (const a of bets) {
      let applied = false;
      try {
        const debit = applyBet(t.state, a);
        applied = true;
        rememberChip(t.state, a);
        debitBet(userId, debit, "craps", t.id, `cr-rep-${t.id}-${key}-${placed.length}`, a);
        placed.push(a);
        placedCents += debit;
        save(userId, t);
      } catch (e) {
        if (applied) {
          try { undoLastChip(t.state); } catch { /* already reversed */ }
          throw e;
        }
      }
    }
  };
  run(repeatPlan(t.state, pattern));
  run(repeatPlan(t.state));
  return { placed, placedCents };
}

export async function GET(req: Request) {
  return withUser(req, async (user) => {
    const t = table(user.id);
    return json({ user: toPublic(user), table: publicCraps(t.state) });
  });
}

export async function POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    const t = table(user.id);
    const action = String(body.action || "");
    const key = String(body.idempotencyKey || newId());

    if (action === "bet") {
      const a = body.bet as PlaceAction;
      const debit = applyBet(t.state, a);
      rememberChip(t.state, a);
      debitBet(user.id, debit, "craps", t.id, `cr-bet-${t.id}-${key}`, a);
      if (t.state.alwaysRepeat) lockCurrentLayout(t.state);
      save(user.id, t);
      const u = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
      return json({ user: toPublic(u), table: publicCraps(t.state), balanceCents: getBalance(user.id) });
    }
    if (action === "undo") {
      const taken = undoLastChip(t.state);
      applyLedger({
        userId: user.id,
        type: "refund",
        amountCents: taken.amount,
        game: "craps",
        ref: t.id,
        idempotencyKey: `cr-undo-${t.id}-${key}`,
        meta: taken,
      });
      if (t.state.alwaysRepeat) lockCurrentLayout(t.state);
      save(user.id, t);
      const u = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
      return json({ user: toPublic(u), table: publicCraps(t.state), undone: taken, balanceCents: getBalance(user.id) });
    }
    if (action === "always") {
      t.state.alwaysRepeat = !!body.on;
      if (t.state.alwaysRepeat) {
        if (!(t.state.lastRound || []).length) lockCurrentLayout(t.state);
      }
      save(user.id, t);
      const u = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
      return json({ user: toPublic(u), table: publicCraps(t.state) });
    }
    if (action === "repeat") {
      const fromBody = Array.isArray(body.bets) ? (body.bets as PlaceAction[]) : [];
      const { placed, placedCents } = applyRepeat(user.id, t, key, fromBody.length ? fromBody : undefined);
      if (!placed.length && !(t.state.lastRound || []).length) return err("nothing to repeat — put chips down and roll once first");
      const u = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
      return json({ user: toPublic(u), table: publicCraps(t.state), repeated: placed.length, placedCents, balanceCents: getBalance(user.id) });
    }
    if (action === "roll") {
      takeRoundSnapshot(t.state);
      const dice = rollDice();
      const r = resolveRoll(t.state, dice);
      if (r.payoutCents > 0) {
        creditPayout(user.id, r.payoutCents, "craps", `${t.id}-${key}`, `cr-pay-${t.id}-${key}`);
      }
      let repeatedCents = 0;
      if (t.state.alwaysRepeat && (t.state.lastRound || []).length) {
        const again = applyRepeat(user.id, t, `${key}-auto`);
        repeatedCents = again.placedCents;
      }
      save(user.id, t);
      const u = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
      return json({
        user: toPublic(u),
        table: publicCraps(t.state),
        roll: dice,
        payoutCents: r.payoutCents,
        repeatedCents,
        balanceCents: getBalance(user.id),
      });
    }
    return err("unknown action");
  });
}
