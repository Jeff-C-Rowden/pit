/** One tournament round on the tournament stack (never the wallet). Same engines, same odds. */
import type Database from "better-sqlite3";
import { newId } from "../rng";
import { serverNow } from "../clock";
import { breakUntil, sessionBlock } from "../session";
import { chicagoTime } from "../limitText";
import { roundPoints } from "./scoring";
import { TnyError, boardOf, getTournament, myEntry, ensureSchedule } from "./store";
import type { EntryRow, TournamentRow } from "./schema";

export const MIN_ROUND_GAP_MS = 700;
const fail = (code: string, msg: string): never => { throw new TnyError(code, msg); };

export type RoundOutcome<R> = { stake: number; ret: number; summary?: string; result: R };

/**
 * Validate, run `fn` (which calls the real game engine and reports stake/return), then move the
 * stack, score, bet count and audit row in one transaction. `check(stake)` must be called by fn
 * before it settles so bet limits are enforced on the server.
 */
export function playTournamentRound<R>(db: Database.Database, userId: string, tid: string, game: string, key: string, fn: (check: (stake: number) => void) => RoundOutcome<R>) {
  const now = serverNow();
  ensureSchedule(db, now);
  const t = getTournament(db, tid);
  if (t.game !== game) fail("TNY_WRONG_GAME", `This tournament is played on ${t.game}.`);
  const e = myEntry(db, tid, userId);
  if (!e || e.status !== "registered") fail("TNY_NOT_ENTERED", "Register for this tournament first.");
  if (t.status !== "live" || now.toISOString() < t.starts_at) fail("TNY_NOT_LIVE", t.status === "finished" || now.toISOString() >= t.ends_at ? "This tournament has ended." : "This tournament hasn't started yet.");
  if (now.toISOString() >= t.ends_at) fail("TNY_RUN_OVER", "This tournament has ended.");
  const br = breakUntil(db, userId, now);
  if (br) fail("ON_BREAK", `you're on a break you chose; play opens at ${chicagoTime(br)}`);
  const sb = sessionBlock(db, userId, now);
  if (sb) fail("SESSION_LIMIT", `your session time limit is up; play opens at ${chicagoTime(sb.breakEndsAt)}`);
  if (e!.last_round_at && now.getTime() - Date.parse(e!.last_round_at) < MIN_ROUND_GAP_MS) fail("TNY_TOO_FAST", "One round at a time: give the reels a moment.");
  if (db.prepare("SELECT 1 FROM tournament_rounds WHERE idempotency_key = ?").get(`${tid}:${key}`)) fail("TNY_DUPLICATE", "That round was already played.");
  const check = (stake: number) => {
    if (!Number.isInteger(stake) || stake < t.min_bet_cents || stake > t.max_bet_cents) fail("TNY_BET_LIMIT", `Tournament bets are ${(t.min_bet_cents / 100).toFixed(2)} to ${(t.max_bet_cents / 100).toFixed(2)} per round.`);
    if (stake > e!.stack_cents) fail("TNY_STACK", "Not enough tournament chips for that bet." + (t.rebuy_fee_cents ? " A rebuy may be open on the tournament page." : ""));
  };
  const out = fn(check);
  check(out.stake);
  return db.transaction(() => {
    const stack = e!.stack_cents - out.stake + out.ret;
    const pts = roundPoints(out.stake, out.ret);
    const nowIso = now.toISOString();
    const score = t.rank_mode === "balance" ? stack : e!.score + pts;
    const reached = score !== e!.score ? nowIso : e!.score_reached_at;
    db.prepare(`UPDATE tournament_entries SET stack_cents = ?, score = ?, score_reached_at = ?, bets_made = bets_made + 1, wagered_cents = wagered_cents + ?,
      best_round_points = MAX(best_round_points, ?), last_round_at = ? WHERE id = ?`).run(stack, score, reached, out.stake, pts, nowIso, e!.id);
    db.prepare(`INSERT INTO tournament_rounds (id, entry_id, game, stake_cents, return_cents, points, stack_after_cents, idempotency_key, summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(newId(), e!.id, game, out.stake, out.ret, pts, stack, `${tid}:${key}`, (out.summary ?? "").slice(0, 120), nowIso);
    return { result: out.result, points: pts, stackCents: stack };
  })();
}

/** In-game strip data: rank, score, stack, bets made / to qualify, time left, prize if it ended now. */
export function tournamentHud(db: Database.Database, userId: string, tid: string) {
  const now = serverNow();
  const t: TournamentRow = getTournament(db, tid);
  const b = boardOf(db, t);
  const me = b.rows.find((r) => r.user_id === userId) as (EntryRow & { rank: number; qualified: boolean; prizeCents: number }) | undefined;
  return {
    id: t.id,
    name: t.name,
    game: t.game,
    mode: t.rank_mode,
    status: t.status,
    startsAt: t.starts_at,
    endsAt: t.ends_at,
    serverNow: now.toISOString(),
    prizeType: t.prize_type,
    entrants: b.rows.length,
    qualifiedCount: b.qualifiedCount,
    poolCents: b.pool.poolCents,
    ladder: b.ladder.slice(0, 5),
    minBetCents: t.min_bet_cents,
    maxBetCents: t.max_bet_cents,
    minQualifyingBets: t.min_qualifying_bets,
    entered: !!me,
    rank: me?.rank ?? null,
    score: me?.score ?? 0,
    stackCents: me?.stack_cents ?? 0,
    betsMade: me?.bets_made ?? 0,
    toQualify: me ? Math.max(0, t.min_qualifying_bets - me.bets_made) : t.min_qualifying_bets,
    qualified: !!me?.qualified,
    prizeIfEndedNowCents: me?.prizeCents ?? 0,
    canRebuy: !!(me && t.rebuy_fee_cents && me.stack_cents <= (t.rebuy_max_balance_cents ?? 0) && me.rebuys < t.rebuy_limit && t.status === "live"),
    top: b.rows.slice(0, 5).map((r) => ({ rank: r.rank, name: r.display_name, score: r.score, qualified: r.qualified })),
  };
}
