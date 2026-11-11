import { withDbSync } from "@/lib/dbSync";
import { withUser, json, err } from "@/lib/http";
import { debitBet, creditPayout, applyLedger, saveGame, loadOpenGame, getBalance } from "@/lib/ledger";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";
import { crapsTournament } from "@/lib/tournaments/tables";
import { tournamentHud } from "@/lib/tournaments/play";
import {
  layoutActions,
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

async function _GET(req: Request) {
  return withUser(req, async (user) => {
    const tid = new URL(req.url).searchParams.get("t");
    if (tid) {
      // Tournament table: its own hand/table on the tournament stack (never the wallet).
      const db = getDb();
      return json({ user: toPublic(user), ...crapsTournament(db, user.id, tid, { action: "state" }), tournament: tournamentHud(db, user.id, tid) });
    }
    const t = table(user.id);
    return json({ user: toPublic(user), table: publicCraps(t.state) });
  });
}

async function _POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    if (body.tournamentId) {
      const db = getDb();
      const tid = String(body.tournamentId);
      const out = crapsTournament(db, user.id, tid, body);
      return json({ ...out, tournament: tournamentHud(db, user.id, tid) });
    }
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
      const riskedCents = layoutActions(t.state).reduce((n, b) => n + (Number(b.amount) || 0), 0);
      takeRoundSnapshot(t.state);
      const dice = rollDice();
      const r = resolveRoll(t.state, dice);
      const rollRef = `${t.id}-${key}`;
      if (r.payoutCents > 0) {
        creditPayout(user.id, r.payoutCents, "craps", rollRef, `cr-pay-${t.id}-${key}`, { stakeBackCents: r.stakeBackCents, wonCents: r.payoutCents - r.stakeBackCents });
      }
      // Remember the roll for "Replay last result"; the paid amount is read back from the ledger.
      const db = getDb();
      // Tables that rolled before marks existed can't tell which bets belong to this roll; skip rather than guess.
      const mark = t.state.ledgerMark ?? (t.state.lastRollRecord ? Number.MAX_SAFE_INTEGER : 0);
      const betRows = db.prepare("SELECT id, rowid AS rid FROM ledger WHERE user_id = ? AND game = 'craps' AND type = 'bet' AND ref = ? AND rowid > ? ORDER BY rowid")
        .all(user.id, t.id, mark) as { id: string; rid: number }[];
      const rec = { ref: rollRef, dice: [dice[0], dice[1]] as [number, number], riskedCents, at: new Date().toISOString(), betLineIds: betRows.map((b) => b.id) };
      t.state.lastRollRecord = rec;
      t.state.rollLog = [...(t.state.rollLog || []), rec].slice(-20);
      t.state.ledgerMark = (db.prepare("SELECT COALESCE(MAX(rowid), 0) AS m FROM ledger WHERE user_id = ?").get(user.id) as { m: number }).m;
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
        rollRef,
        payoutCents: r.payoutCents,
        stakeBackCents: r.stakeBackCents,
        repeatedCents,
        balanceCents: getBalance(user.id),
      });
    }
    return err("unknown action");
  });
}

export const GET = withDbSync(_GET);
export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
