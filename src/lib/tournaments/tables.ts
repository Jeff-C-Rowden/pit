/**
 * Table tournaments (spec §5.3): Blackjack Chip Race and Craps Hot Roll. Same engines and odds as
 * the floor; only the money source differs. A hand or roll in progress keeps its chips off the
 * stack until it settles, so the stack, score and bets made only change on settled rounds.
 * Hands/tables live in game_states under game = "tny:<tournamentId>" so they never mix with
 * floor play, replay or history.
 */
import type Database from "better-sqlite3";
import { newId } from "../rng";
import { serverNow } from "../clock";
import { breakUntil, sessionBlock } from "../session";
import { chicagoTime } from "../limitText";
import { saveGame } from "../ledger";
import { roundPoints } from "./scoring";
import { TnyError, ensureSchedule, getTournament, myEntry } from "./store";
import type { EntryRow, TournamentRow } from "./schema";
import {
  startBlackjack, hit, stand, double, split, takeInsurance, publicBlackjack, type BjState,
} from "../games/blackjack";
import {
  applyBet, layoutActions, newCrapsTable, publicCraps, resolveRoll, rollDice, rememberChip, undoLastChip,
  type CrapsState, type PlaceAction,
} from "../games/craps";

export const MIN_ROUND_GAP_MS = 700;
/** A hand in flight at the end may still be finished for this long (spec §4.5). */
export const HAND_GRACE_MS = 120_000;
const fail = (code: string, msg: string): never => { throw new TnyError(code, msg); };
export const tnyGameKey = (tid: string) => `tny:${tid}`;

type Gate = { t: TournamentRow; e: EntryRow; now: Date };

/**
 * Checks shared by every tournament round. `wager` = this action puts new chips at risk (breaks,
 * session limit and the end time apply). `newRound` = it starts a counted play (pacing, fixed plays).
 * `inFlight` = finishing a hand already dealt: allowed until the end + grace.
 */
export function gate(db: Database.Database, userId: string, tid: string, game: string, o: { wager: boolean; newRound: boolean; inFlight?: boolean }): Gate {
  const now = serverNow();
  ensureSchedule(db, now);
  const t = getTournament(db, tid);
  if (t.game !== game) fail("TNY_WRONG_GAME", `This tournament is played on ${t.game}.`);
  const e = myEntry(db, tid, userId);
  if (!e || e.status !== "registered") fail(t.status === "finished" ? "TNY_RUN_OVER" : "TNY_NOT_ENTERED", t.status === "finished" ? "This tournament has ended." : "Register for this tournament first.");
  const nowIso = now.toISOString();
  if (nowIso < t.starts_at) fail("TNY_NOT_LIVE", "This tournament hasn't started yet.");
  if (o.inFlight) {
    if (now.getTime() > Date.parse(t.ends_at) + HAND_GRACE_MS) fail("TNY_RUN_OVER", "This tournament has ended.");
  } else if (t.status !== "live" || nowIso >= t.ends_at) fail("TNY_RUN_OVER", "This tournament has ended.");
  if (o.wager) {
    const br = breakUntil(db, userId, now);
    if (br) fail("ON_BREAK", `you're on a break you chose; play opens at ${chicagoTime(br)}`);
    const sb = sessionBlock(db, userId, now);
    if (sb) fail("SESSION_LIMIT", `your session time limit is up; play opens at ${chicagoTime(sb.breakEndsAt)}`);
  }
  if (o.newRound) {
    if (t.fixed_plays && (e!.plays_used ?? 0) >= t.fixed_plays) fail("TNY_PLAYS_DONE", `You've played all ${t.fixed_plays} ${t.game === "craps" ? "rolls" : "hands"}. Your score stands; check the leaderboard.`);
    if (e!.last_round_at && now.getTime() - Date.parse(e!.last_round_at) < MIN_ROUND_GAP_MS) fail("TNY_TOO_FAST", "One round at a time: give it a moment.");
  }
  return { t, e: e!, now };
}

/** Move chips from the stack onto the felt. Never below zero. */
export function takeStake(db: Database.Database, entryId: string, cents: number) {
  if (!Number.isInteger(cents) || cents <= 0) fail("TNY_BET_LIMIT", "Bet must be a positive amount.");
  const r = db.prepare("UPDATE tournament_entries SET stack_cents = stack_cents - ? WHERE id = ? AND stack_cents >= ?").run(cents, entryId, cents);
  if (r.changes !== 1) fail("TNY_STACK", "Not enough tournament chips for that bet.");
}

/**
 * Settle one counted round: credit `stackCredit` to the stack, score it (points only when the
 * round's stake reaches the table minimum, which is also what makes it a qualifying bet), write
 * the audit row. In balance mode the score is the stack.
 */
export function settleRound(db: Database.Database, t: TournamentRow, entryId: string, r: {
  stake: number; ret: number; stackCredit: number; key: string; summary: string; countPlay: boolean; now: Date;
}) {
  const e = db.prepare("SELECT * FROM tournament_entries WHERE id = ?").get(entryId) as EntryRow;
  const qualifying = r.stake >= t.min_bet_cents;
  const pts = qualifying ? roundPoints(r.stake, r.ret) : 0;
  const stack = e.stack_cents + r.stackCredit;
  const nowIso = r.now.toISOString();
  const score = t.rank_mode === "balance" ? stack : e.score + pts;
  const reached = score !== e.score ? nowIso : e.score_reached_at;
  db.prepare(`UPDATE tournament_entries SET stack_cents = ?, score = ?, score_reached_at = ?, bets_made = bets_made + ?, plays_used = plays_used + ?,
    wagered_cents = wagered_cents + ?, best_round_points = MAX(best_round_points, ?), last_round_at = ? WHERE id = ?`)
    .run(stack, score, reached, qualifying ? 1 : 0, r.countPlay ? 1 : 0, r.stake, pts, nowIso, e.id);
  db.prepare(`INSERT INTO tournament_rounds (id, entry_id, game, stake_cents, return_cents, points, stack_after_cents, idempotency_key, summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(newId(), e.id, t.game, r.stake, r.ret, pts, stack, `${t.id}:${r.key}`, r.summary.slice(0, 120), nowIso);
  return { points: pts, stackCents: stack, qualifying };
}

/** Balance-mode score follows the stack even between rounds (chips returned at the end). */
function syncBalanceScore(db: Database.Database, t: TournamentRow, entryId: string, now: Date) {
  if (t.rank_mode !== "balance") return;
  db.prepare("UPDATE tournament_entries SET score = stack_cents, score_reached_at = CASE WHEN score != stack_cents THEN ? ELSE score_reached_at END WHERE id = ?")
    .run(now.toISOString(), entryId);
}

function loadTny<T>(db: Database.Database, userId: string, tid: string): { id: string; state: T } | null {
  const row = db.prepare("SELECT id, state_json FROM game_states WHERE user_id = ? AND game = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1")
    .get(userId, tnyGameKey(tid)) as { id: string; state_json: string } | undefined;
  return row ? { id: row.id, state: JSON.parse(row.state_json) as T } : null;
}
function saveTny(db: Database.Database, userId: string, tid: string, id: string, state: unknown, open: boolean) {
  saveGame({ id, userId, game: tnyGameKey(tid), status: open ? "open" : "settled", state }, db);
}

// ───────── Blackjack Chip Race ─────────

type BjTny = { bj: BjState; staked: number; entryId: string };
const bjStaked = (s: BjState) => s.playerHands.reduce((a, h) => a + h.betCents, 0) + (s.insuranceCents || 0);

/** Play out a hand nobody finished: decline insurance, stand every hand, dealer draws. Never forfeits. */
export function autoFinishHand(s: BjState): BjState {
  if (s.phase === "insurance") s = takeInsurance(s, false);
  let guard = 0;
  while (s.phase === "play" && guard++ < 10) s = stand(s);
  return s;
}

function settleBjIfDone(db: Database.Database, t: TournamentRow, w: BjTny, now: Date, key: string) {
  if (w.bj.phase !== "settled") return null;
  const ret = w.bj.payoutCents ?? 0;
  return settleRound(db, t, w.entryId, { stake: w.staked, ret, stackCredit: ret, key: `bj-${w.bj.id}`, summary: `${w.bj.result ?? "settled"} · staked ${w.staked} · paid ${ret}`, countPlay: true, now });
}

export function blackjackTournament(db: Database.Database, userId: string, tid: string, body: Record<string, unknown>) {
  const action = String(body.action || "");
  const key = String(body.idempotencyKey || newId());
  if (action === "state") {
    const open = loadTny<BjTny>(db, userId, tid);
    return { game: open ? publicBlackjack(open.state.bj, false) : null };
  }
  if (action === "deal") {
    const g = gate(db, userId, tid, "blackjack", { wager: true, newRound: true });
    if (loadTny<BjTny>(db, userId, tid)) fail("TNY_OPEN_HAND", "Finish the hand on the felt first.");
    const bet = Number(body.betCents);
    if (!Number.isInteger(bet) || bet < g.t.min_bet_cents || bet > g.t.max_bet_cents) fail("TNY_BET_LIMIT", `Chip Race bets are $${(g.t.min_bet_cents / 100).toFixed(2)} to $${(g.t.max_bet_cents / 100).toFixed(2)} a hand.`);
    if (bet > g.e.stack_cents) fail("TNY_STACK", "Not enough tournament chips for that bet.");
    return db.transaction(() => {
      const bj = startBlackjack(bet);
      takeStake(db, g.e.id, bet);
      const w: BjTny = { bj, staked: bet, entryId: g.e.id };
      const settled = settleBjIfDone(db, g.t, w, g.now, key);
      saveTny(db, userId, tid, bj.id, w, !settled);
      return { game: publicBlackjack(bj, !!settled) };
    })();
  }
  const open = loadTny<BjTny>(db, userId, tid);
  if (!open || String(body.gameId || open.id) !== open.id) fail("TNY_NO_HAND", "No open tournament hand.");
  const g = gate(db, userId, tid, "blackjack", { wager: action === "double" || action === "split" || (action === "insurance" && !!body.take), newRound: false, inFlight: true });
  return db.transaction(() => {
    const w = open!.state;
    let s = w.bj;
    if (action === "insurance") {
      if (s.phase !== "insurance") fail("TNY_ACTION", "Insurance isn't offered now.");
      if (body.take) takeStake(db, w.entryId, Math.floor(s.playerHands[0]!.betCents / 2));
      s = takeInsurance(s, !!body.take);
    } else if (action === "hit") s = hit(s);
    else if (action === "stand") s = stand(s);
    else if (action === "double" || action === "split") {
      // Doubles and splits may go past the per-hand max (spec), but never past the stack.
      const extra = s.playerHands[s.active]?.betCents ?? 0;
      takeStake(db, w.entryId, extra);
      s = action === "double" ? double(s).state : split(s).state;
    } else if (action === "abandon") s = autoFinishHand(s);
    else fail("TNY_ACTION", "Unknown action.");
    w.bj = s;
    w.staked = bjStaked(s);
    const settled = settleBjIfDone(db, g.t, w, g.now, key);
    saveTny(db, userId, tid, open!.id, w, !settled);
    return { game: publicBlackjack(s, !!settled) };
  })();
}

// ───────── Craps Hot Roll ─────────

type CrTny = { table: CrapsState; newAction: number; entryId: string };
const layoutTotal = (s: CrapsState) => layoutActions(s).reduce((n, b) => n + (Number(b.amount) || 0), 0);

function crapsTable(db: Database.Database, userId: string, tid: string, entryId: string): { id: string; state: CrTny } {
  const open = loadTny<CrTny>(db, userId, tid);
  if (open) return open;
  const table = newCrapsTable();
  return { id: table.id, state: { table, newAction: 0, entryId } };
}

/** Return every chip still on the felt to the stack (final roll, or the end of the event). No score. */
function returnLayout(db: Database.Database, t: TournamentRow, w: CrTny, now: Date) {
  const back = layoutTotal(w.table);
  if (back > 0) db.prepare("UPDATE tournament_entries SET stack_cents = stack_cents + ? WHERE id = ?").run(back, w.entryId);
  syncBalanceScore(db, t, w.entryId, now);
  return back;
}

export function crapsTournament(db: Database.Database, userId: string, tid: string, body: Record<string, unknown>) {
  const action = String(body.action || "state");
  const key = String(body.idempotencyKey || newId());
  if (action === "state") {
    const open = loadTny<CrTny>(db, userId, tid);
    return { table: publicCraps(open ? open.state.table : newCrapsTable()), newActionCents: open?.state.newAction ?? 0 };
  }
  if (action === "bet") {
    const g = gate(db, userId, tid, "craps", { wager: true, newRound: false });
    if (g.t.fixed_plays && (g.e.plays_used ?? 0) >= g.t.fixed_plays) fail("TNY_PLAYS_DONE", `You've rolled all ${g.t.fixed_plays} rolls.`);
    return db.transaction(() => {
      const tb = crapsTable(db, userId, tid, g.e.id);
      const a = body.bet as PlaceAction;
      const debit = applyBet(tb.state.table, a);
      if (tb.state.newAction + debit > g.t.max_bet_cents) fail("TNY_BET_LIMIT", `Hot Roll allows $${(g.t.max_bet_cents / 100).toFixed(2)} of new bets per roll.`);
      takeStake(db, g.e.id, debit);
      rememberChip(tb.state.table, a);
      tb.state.newAction += debit;
      saveTny(db, userId, tid, tb.id, tb.state, true);
      return { table: publicCraps(tb.state.table), newActionCents: tb.state.newAction };
    })();
  }
  if (action === "undo") {
    const g = gate(db, userId, tid, "craps", { wager: false, newRound: false, inFlight: true });
    return db.transaction(() => {
      const tb = crapsTable(db, userId, tid, g.e.id);
      const taken = undoLastChip(tb.state.table);
      db.prepare("UPDATE tournament_entries SET stack_cents = stack_cents + ? WHERE id = ?").run(taken.amount, g.e.id);
      tb.state.newAction = Math.max(0, tb.state.newAction - taken.amount);
      saveTny(db, userId, tid, tb.id, tb.state, true);
      return { table: publicCraps(tb.state.table), newActionCents: tb.state.newAction, undone: taken };
    })();
  }
  if (action === "roll") {
    const g = gate(db, userId, tid, "craps", { wager: true, newRound: true });
    return db.transaction(() => {
      const tb = crapsTable(db, userId, tid, g.e.id);
      const w = tb.state;
      const before = layoutTotal(w.table);
      if (before < g.t.min_bet_cents) fail("TNY_BET_LIMIT", `Put at least $${(g.t.min_bet_cents / 100).toFixed(2)} on the felt to roll.`);
      const dice = rollDice();
      const r = resolveRoll(w.table, dice);
      const after = layoutTotal(w.table);
      // Spec §4.2 craps: S = stake of bets resolved by this roll; R = what they returned.
      const stake = before - after + r.stayCents;
      const ret = r.payoutCents + r.stayCents;
      const out = settleRound(db, g.t, w.entryId, { stake, ret, stackCredit: r.payoutCents, key: `roll-${key}`, summary: `${dice[0]}+${dice[1]} · resolved ${stake} · returned ${ret}`, countPlay: true, now: g.now });
      w.newAction = 0;
      w.table.pendingChips = [];
      const fresh = db.prepare("SELECT plays_used FROM tournament_entries WHERE id = ?").get(w.entryId) as { plays_used: number };
      let returnedCents = 0;
      const lastRoll = !!g.t.fixed_plays && fresh.plays_used >= g.t.fixed_plays;
      if (lastRoll) {
        // Final roll: outstanding bets go back to the stack (no score), the table closes.
        returnedCents = returnLayout(db, g.t, w, g.now);
        saveTny(db, userId, tid, tb.id, w, false);
      } else saveTny(db, userId, tid, tb.id, w, true);
      return {
        table: publicCraps(lastRoll ? newCrapsTable() : w.table), roll: dice, payoutCents: r.payoutCents, resolvedStakeCents: stake, returnCents: ret,
        points: out.points, qualifying: out.qualifying, returnedCents, lastRoll, newActionCents: 0,
      };
    })();
  }
  return fail("TNY_ACTION", "That isn't available in tournament craps.");
}

/** At finalize: auto-finish open hands (scored) and return craps chips still on the felt. */
export function closeOpenTableRounds(db: Database.Database, t: TournamentRow, now: Date) {
  if (t.game !== "blackjack" && t.game !== "craps") return;
  const rows = db.prepare("SELECT id, user_id, state_json FROM game_states WHERE game = ? AND status = 'open'").all(tnyGameKey(t.id)) as { id: string; user_id: string; state_json: string }[];
  for (const row of rows) {
    if (t.game === "blackjack") {
      const w = JSON.parse(row.state_json) as BjTny;
      w.bj = autoFinishHand(w.bj);
      w.staked = bjStaked(w.bj);
      settleBjIfDone(db, t, w, now, "auto");
      saveTny(db, row.user_id, t.id, row.id, w, false);
    } else {
      const w = JSON.parse(row.state_json) as CrTny;
      returnLayout(db, t, w, now);
      saveTny(db, row.user_id, t.id, row.id, w, false);
    }
  }
}
