/**
 * Tournament persistence and lifecycle (SQLite, synced by dbSync like everything else).
 * Lazy: ensureSchedule() runs on tournament reads and writes and does only the work that is due.
 * Writes happen only when something changes, so idle polls never mark the snapshot dirty.
 */
import type Database from "better-sqlite3";
import { applyLedger, LedgerError } from "../ledger";
import { creditBonus } from "../bonus";
import { newId } from "../rng";
import { breakUntil, sessionBlock } from "../session";
import { chicagoTime } from "../limitText";
import { applyPrizeCap, feeSplit, ladder, ladderLegend, prizePool } from "./payout";
import { closeOpenTableRounds } from "./tables";
import { rankBoard, type RankMode } from "./scoring";
import { chicagoYmd, instancesBetween } from "./schedule";
import { GAME_INFO, type TGame } from "./templates";
import type { EntryRow, TournamentRow } from "./schema";

export const FREEROLLS_PER_DAY = 3;
/** Spec §4.5: a hand in flight at the end may finish within 120 s; then it is auto-settled. */
export const FINALIZE_GRACE_MS = 120_000;
/** Spec §2.9: freeroll prizes per account are capped at $25 a Chicago day; excess goes to the next place. */
export const FREEROLL_PLAYER_DAY_CAP_CENTS = 2500;

export class TnyError extends LedgerError {}
const fail = (code: string, msg: string): never => { throw new TnyError(code, msg); };

export function maskName(name: string): string {
  const parts = String(name || "Player").trim().split(/\s+/).filter(Boolean);
  const first = (parts[0] || "Player").slice(0, 14);
  return parts.length > 1 ? `${first} ${parts[parts.length - 1]![0]!.toUpperCase()}.` : first;
}

export function getTournament(db: Database.Database, id: string): TournamentRow {
  const t = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(id) as TournamentRow | undefined;
  return t ?? fail("TNY_NOT_FOUND", "That tournament doesn't exist.");
}

/** Materialize the schedule window and advance due tournaments. Returns what changed. */
export function ensureSchedule(db: Database.Database, now: Date, maxTransitions = 20) {
  const from = new Date(now.getTime() - 24 * 3600_000), to = new Date(now.getTime() + 48 * 3600_000);
  const drafts = instancesBetween(from, to);
  const have = new Set((db.prepare("SELECT id FROM tournaments WHERE ends_at > ?").all(from.toISOString()) as { id: string }[]).map((r) => r.id));
  const missing = drafts.filter((d) => !have.has(d.id));
  let created = 0;
  if (missing.length) {
    const ins = db.prepare(`INSERT OR IGNORE INTO tournaments (id, template_id, name, format, category, game, rank_mode, starts_at, ends_at, reg_closes_at, duration_min,
      buyin_cents, fee_bps, house_seed_cents, prize_type, start_stack_cents, min_bet_cents, max_bet_cents, min_qualifying_bets, rebuy_fee_cents,
      rebuy_stack_cents, rebuy_max_balance_cents, rebuy_limit, fixed_plays, chicago_day, status, seed, created_at)
      VALUES (@id, @template_id, @name, @format, @category, @game, @rank_mode, @starts_at, @ends_at, @reg_closes_at, @duration_min,
      @buyin_cents, @fee_bps, @house_seed_cents, @prize_type, @start_stack_cents, @min_bet_cents, @max_bet_cents, @min_qualifying_bets, @rebuy_fee_cents,
      @rebuy_stack_cents, @rebuy_max_balance_cents, @rebuy_limit, @fixed_plays, @chicago_day, @status, @seed, @created_at)`);
    db.transaction(() => {
      for (const d of missing) {
        const status = Date.parse(d.ends_at) <= now.getTime() ? "live" : Date.parse(d.starts_at) <= now.getTime() ? "live" : "scheduled";
        created += ins.run({ ...d, status, created_at: now.toISOString() }).changes;
      }
    })();
  }
  const nowIso = now.toISOString();
  // A template edit (e.g. Happy Hour rotating in Blackjack and Craps) re-shapes rows that haven't
  // started and have no entries yet. Rows already in play are never changed.
  const SHAPE = ["name", "format", "category", "game", "rank_mode", "buyin_cents", "fee_bps", "house_seed_cents", "prize_type", "start_stack_cents",
    "min_bet_cents", "max_bet_cents", "min_qualifying_bets", "rebuy_fee_cents", "rebuy_stack_cents", "rebuy_max_balance_cents", "rebuy_limit", "fixed_plays"] as const;
  const pending = db.prepare(`SELECT t.* FROM tournaments t WHERE t.status = 'scheduled' AND t.starts_at > ?
    AND NOT EXISTS (SELECT 1 FROM tournament_entries e WHERE e.tournament_id = t.id)`).all(nowIso) as TournamentRow[];
  if (pending.length) {
    const byId = new Map(drafts.map((d) => [d.id, d]));
    for (const row of pending) {
      const d = byId.get(row.id);
      if (!d) continue;
      const diff = SHAPE.filter((k) => (row as Record<string, unknown>)[k] !== (d as Record<string, unknown>)[k]);
      if (diff.length) db.prepare(`UPDATE tournaments SET ${SHAPE.map((k) => `${k} = @${k}`).join(", ")} WHERE id = @id AND status = 'scheduled'`).run(d);
    }
  }
  let transitions = 0;
  const toLive = db.prepare("SELECT id FROM tournaments WHERE status = 'scheduled' AND starts_at <= ? ORDER BY starts_at LIMIT ?").all(nowIso, maxTransitions) as { id: string }[];
  for (const r of toLive) { db.prepare("UPDATE tournaments SET status = 'live' WHERE id = ? AND status = 'scheduled'").run(r.id); transitions++; }
  const due = db.prepare("SELECT id FROM tournaments WHERE status = 'live' AND ends_at <= ? ORDER BY ends_at LIMIT ?")
    .all(new Date(now.getTime() - FINALIZE_GRACE_MS).toISOString(), Math.max(0, maxTransitions - transitions)) as { id: string }[];
  for (const r of due) { finalizeTournament(db, r.id, now); transitions++; }
  return { created, transitions };
}

/** Real entrants only: withdrawn entries and test accounts (users.is_test) never rank, count or win. */
export function activeEntries(db: Database.Database, tid: string): EntryRow[] {
  return db.prepare(`SELECT e.* FROM tournament_entries e JOIN users u ON u.id = e.user_id
    WHERE e.tournament_id = ? AND e.status != 'withdrawn' AND COALESCE(u.is_test, 0) = 0`).all(tid) as EntryRow[];
}

export function isTestUser(db: Database.Database, userId: string | null): boolean {
  if (!userId) return false;
  const r = db.prepare("SELECT is_test FROM users WHERE id = ?").get(userId) as { is_test?: number } | undefined;
  return !!r?.is_test;
}

/** Freeroll prizes this account already won on Chicago day `day` (other tournaments). */
export function freerollWonOnDay(db: Database.Database, userId: string, day: string, exceptTid: string): number {
  const rows = db.prepare(`SELECT e.prize_cents AS p, t.finalized_at AS f FROM tournament_entries e JOIN tournaments t ON t.id = e.tournament_id
    WHERE e.user_id = ? AND t.buyin_cents = 0 AND e.status = 'paid' AND t.id != ? AND t.finalized_at IS NOT NULL`).all(userId, exceptTid) as { p: number | null; f: string }[];
  return rows.filter((r) => chicagoYmd(new Date(r.f)) === day).reduce((a, r) => a + (r.p ?? 0), 0);
}

export function poolOf(db: Database.Database, t: TournamentRow) {
  const r = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(e.rebuys), 0) AS rb FROM tournament_entries e JOIN users u ON u.id = e.user_id
    WHERE e.tournament_id = ? AND e.status != 'withdrawn' AND COALESCE(u.is_test, 0) = 0`).get(t.id) as { n: number; rb: number };
  const paid = t.buyin_cents > 0 ? r.n : 0;
  return { entrants: r.n, ...prizePool(paid, t.buyin_cents > 0 ? r.rb : 0, t.buyin_cents, r.n > 0 || t.status !== "finished" ? t.house_seed_cents : 0, t.fee_bps) };
}

export function boardOf(db: Database.Database, t: TournamentRow, now = new Date()) {
  const pool = poolOf(db, t);
  const board = rankBoard(activeEntries(db, t.id), t.rank_mode as RankMode, t.min_qualifying_bets, (q) => ladder(pool.poolCents, q));
  if (t.buyin_cents === 0 && board.rows.some((r) => r.prizeCents > 0)) {
    // $25/day per account across freerolls; the excess moves down to the next place.
    const day = chicagoYmd(t.finalized_at ? new Date(t.finalized_at) : now);
    const capped = applyPrizeCap(board.rows.map((r) => ({ key: r.user_id, eligible: r.qualified || board.fallback, prizeCents: r.prizeCents })),
      (uid) => Math.max(0, FREEROLL_PLAYER_DAY_CAP_CENTS - freerollWonOnDay(db, uid, day, t.id)));
    board.rows = board.rows.map((r, i) => ({ ...r, prizeCents: capped.prizes[i]!, cappedCents: capped.cut[i]! }));
    return { pool, ...board, unpaidCents: capped.unpaidCents };
  }
  return { pool, ...board, unpaidCents: 0 };
}

function assertMayPlay(db: Database.Database, userId: string, now: Date) {
  const br = breakUntil(db, userId, now);
  if (br) fail("ON_BREAK", `you're taking a break you chose; tournaments open again at ${chicagoTime(br)}`);
  const sb = sessionBlock(db, userId, now);
  if (sb) fail("SESSION_LIMIT", `your session time limit is up; play opens after a 30-minute break, at ${chicagoTime(sb.breakEndsAt)}`);
}

export function registerEntry(db: Database.Database, user: { id: string; display_name: string }, tid: string, now: Date) {
  const t = getTournament(db, tid);
  const existing = db.prepare("SELECT * FROM tournament_entries WHERE tournament_id = ? AND user_id = ?").get(tid, user.id) as EntryRow | undefined;
  if (existing && existing.status !== "withdrawn") return existing; // double tap: same entry
  if (existing) fail("TNY_ALREADY_ENTERED", "You withdrew from this one. Pick another tournament.");
  if (t.status === "finished" || now.toISOString() >= t.reg_closes_at) fail("TNY_CLOSED", "Registration for this tournament has closed.");
  assertMayPlay(db, user.id, now);
  if (t.buyin_cents === 0) {
    const day = chicagoYmd(now);
    const today = (db.prepare(`SELECT e.created_at AS c FROM tournament_entries e JOIN tournaments t ON t.id = e.tournament_id
      WHERE e.user_id = ? AND t.buyin_cents = 0 AND e.status != 'withdrawn'`).all(user.id) as { c: string }[])
      .filter((r) => chicagoYmd(new Date(r.c)) === day).length;
    if (today >= FREEROLLS_PER_DAY) fail("TNY_FREEROLL_LIMIT", `That's ${FREEROLLS_PER_DAY} free tournaments today. More open at midnight Chicago time.`);
  }
  return db.transaction(() => {
    if (t.buyin_cents > 0) {
      const { feeCents } = feeSplit(t.buyin_cents, t.fee_bps);
      // Cash only: Bonus never buys into a tournament.
      applyLedger({ userId: user.id, type: "bet", amountCents: -t.buyin_cents, game: "tournament", ref: t.id, idempotencyKey: `tny-buyin-${t.id}-${user.id}`,
        meta: { kind: "buyin", tournamentName: t.name, feeCents } }, db);
      book(db, t.id, "fee", feeCents, `tny-fee-${t.id}-${user.id}`, now);
    }
    const row: EntryRow = {
      id: newId(), tournament_id: t.id, user_id: user.id, display_name: maskName(user.display_name), stack_cents: t.start_stack_cents,
      score: t.rank_mode === "balance" ? t.start_stack_cents : 0, score_reached_at: now.toISOString(), bets_made: 0, wagered_cents: 0,
      best_round_points: 0, rebuys: 0, last_round_at: null, status: "registered", final_rank: null, prize_cents: null, created_at: now.toISOString(), plays_used: 0,
    };
    db.prepare(`INSERT INTO tournament_entries (id, tournament_id, user_id, display_name, stack_cents, score, score_reached_at, bets_made, wagered_cents,
      best_round_points, rebuys, last_round_at, status, final_rank, prize_cents, created_at, plays_used) VALUES (@id, @tournament_id, @user_id, @display_name, @stack_cents,
      @score, @score_reached_at, @bets_made, @wagered_cents, @best_round_points, @rebuys, @last_round_at, @status, @final_rank, @prize_cents, @created_at, @plays_used)`).run(row);
    return row;
  })();
}

function book(db: Database.Database, tid: string, kind: string, cents: number, key: string, now: Date) {
  db.prepare("INSERT OR IGNORE INTO tournament_house_book (id, tournament_id, kind, amount_cents, chicago_day, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(newId(), tid, kind, cents, chicagoYmd(now), key, now.toISOString());
}

export function myEntry(db: Database.Database, tid: string, userId: string): EntryRow | null {
  return (db.prepare("SELECT * FROM tournament_entries WHERE tournament_id = ? AND user_id = ?").get(tid, userId) as EntryRow | undefined) ?? null;
}

export function withdrawEntry(db: Database.Database, userId: string, tid: string, now: Date) {
  const t = getTournament(db, tid);
  const e = myEntry(db, tid, userId);
  if (!e || e.status !== "registered") fail("TNY_NOT_ENTERED", "You're not in this tournament.");
  if (e!.bets_made > 0 || (e!.plays_used ?? 0) > 0 || e!.stack_cents < t.start_stack_cents) fail("TNY_WITHDRAW_LATE", "You've already played in this tournament, so the buy-in can't be refunded.");
  if (t.status === "finished" || now.toISOString() >= t.reg_closes_at) fail("TNY_CLOSED", "Registration has closed, so withdrawals have too.");
  db.transaction(() => {
    if (t.buyin_cents > 0) {
      applyLedger({ userId, type: "refund", amountCents: t.buyin_cents, game: "tournament", ref: t.id, idempotencyKey: `tny-refund-${t.id}-${userId}`,
        meta: { kind: "refund", tournamentName: t.name } }, db);
      book(db, t.id, "fee_refund", -feeSplit(t.buyin_cents, t.fee_bps).feeCents, `tny-feeref-${t.id}-${userId}`, now);
    }
    db.prepare("UPDATE tournament_entries SET status = 'withdrawn' WHERE id = ?").run(e!.id);
  })();
}

export function rebuyEntry(db: Database.Database, userId: string, tid: string, now: Date) {
  const t = getTournament(db, tid);
  const e = myEntry(db, tid, userId);
  if (!e || e.status !== "registered") fail("TNY_NOT_ENTERED", "You're not in this tournament.");
  if (!t.rebuy_fee_cents || !t.rebuy_stack_cents) fail("TNY_REBUY_NOT_ALLOWED", "This tournament has no rebuys.");
  if (t.status !== "live" || now.toISOString() >= t.reg_closes_at) fail("TNY_REBUY_NOT_ALLOWED", "Rebuys are closed for this tournament.");
  if (e!.stack_cents > (t.rebuy_max_balance_cents ?? 0)) fail("TNY_REBUY_NOT_ALLOWED", `Rebuys open when your stack is at or below ${(t.rebuy_max_balance_cents! / 100).toFixed(2)}.`);
  if (e!.rebuys >= t.rebuy_limit) fail("TNY_REBUY_NOT_ALLOWED", `You've used all ${t.rebuy_limit} rebuys.`);
  assertMayPlay(db, userId, now);
  const n = e!.rebuys + 1;
  db.transaction(() => {
    applyLedger({ userId, type: "bet", amountCents: -t.rebuy_fee_cents!, game: "tournament", ref: t.id, idempotencyKey: `tny-rebuy-${t.id}-${userId}-${n}`,
      meta: { kind: "rebuy", tournamentName: t.name, n } }, db);
    book(db, t.id, "fee", feeSplit(t.rebuy_fee_cents!, t.fee_bps).feeCents, `tny-rbfee-${t.id}-${userId}-${n}`, now);
    const stack = e!.stack_cents + t.rebuy_stack_cents!;
    db.prepare(`UPDATE tournament_entries SET rebuys = ?, stack_cents = ?, score = CASE WHEN ? = 'balance' THEN ? ELSE score END,
      score_reached_at = CASE WHEN ? = 'balance' THEN ? ELSE score_reached_at END WHERE id = ?`)
      .run(n, stack, t.rank_mode, stack, t.rank_mode, now.toISOString(), e!.id);
  })();
}

/** Rank, pay prizes (cash or bonus per prize_type), book the seed. Idempotent. Never cancels. */
export function finalizeTournament(db: Database.Database, tid: string, now: Date) {
  db.transaction(() => {
    const t = getTournament(db, tid);
    if (t.status === "finished") return;
    closeOpenTableRounds(db, t, now);
    const b = boardOf(db, t, now);
    for (const r of b.rows) {
      if (r.prizeCents > 0) {
        const meta = { kind: "prize", place: r.rank, tournamentName: t.name, prizeType: t.prize_type };
        const key = `tny-prize-${t.id}-${r.user_id}`;
        if (t.prize_type === "bonus") creditBonus(r.user_id, r.prizeCents, "tournament", t.id, key, meta, "payout", db);
        else applyLedger({ userId: r.user_id, type: "payout", amountCents: r.prizeCents, game: "tournament", ref: t.id, idempotencyKey: key, meta }, db);
      }
      db.prepare("UPDATE tournament_entries SET status = ?, final_rank = ?, prize_cents = ? WHERE id = ?").run(r.prizeCents > 0 ? "paid" : "unplaced", r.rank, r.prizeCents, r.id);
    }
    // Test-account entries never place or win.
    db.prepare(`UPDATE tournament_entries SET status = 'unplaced', final_rank = NULL, prize_cents = 0
      WHERE tournament_id = ? AND status = 'registered' AND user_id IN (SELECT id FROM users WHERE is_test = 1)`).run(t.id);
    if (t.house_seed_cents > 0) {
      const spent = b.rows.length ? Math.max(0, t.house_seed_cents - b.unpaidCents) : 0;
      if (spent > 0) book(db, t.id, "freeroll_seed", spent, `tny-seed-${t.id}`, now);
      if (spent < t.house_seed_cents) book(db, t.id, "seed_unspent", t.house_seed_cents - spent, `tny-seed-unspent-${t.id}`, now);
    }
    db.prepare("UPDATE tournaments SET status = 'finished', finalized_at = ? WHERE id = ?").run(now.toISOString(), t.id);
  })();
}

const pub = (t: TournamentRow) => ({
  id: t.id,
  shortId: `${t.template_id.toUpperCase()}-${t.id.slice(-10, -6)}${t.id.slice(-5, -3)}`,
  name: t.name,
  format: t.format,
  category: t.category,
  game: t.game,
  gameName: GAME_INFO[t.game as TGame]?.name ?? t.game,
  gameHref: GAME_INFO[t.game as TGame]?.href ?? "/floor",
  mode: t.rank_mode,
  startsAt: t.starts_at,
  endsAt: t.ends_at,
  regClosesAt: t.reg_closes_at,
  durationMin: t.duration_min,
  buyinCents: t.buyin_cents,
  feeBps: t.fee_bps,
  seedCents: t.house_seed_cents,
  prizeType: t.prize_type,
  startStackCents: t.start_stack_cents,
  minBetCents: t.min_bet_cents,
  maxBetCents: t.max_bet_cents,
  minQualifyingBets: t.min_qualifying_bets,
  rebuyFeeCents: t.rebuy_fee_cents,
  rebuyStackCents: t.rebuy_stack_cents,
  rebuyMaxBalanceCents: t.rebuy_max_balance_cents,
  rebuyLimit: t.rebuy_limit,
  fixedPlays: t.fixed_plays ?? null,
  unit: GAME_INFO[t.game as TGame]?.unit ?? "rounds",
  status: t.status,
});

/** The viewer's own entry. A test account sees its entry (marked, unranked); nobody else does. */
export function viewerEntry(db: Database.Database, t: TournamentRow, b: ReturnType<typeof boardOf>, userId: string | null) {
  if (!userId) return null;
  const ranked = b.rows.find((r) => r.user_id === userId);
  if (ranked) return { ...ranked, testAccount: false };
  if (!isTestUser(db, userId)) return null;
  const e = myEntry(db, t.id, userId);
  if (!e || e.status === "withdrawn") return null;
  return { ...e, rank: null as number | null, qualified: e.bets_made >= t.min_qualifying_bets, prizeCents: 0, testAccount: true };
}

export type Tab = "live" | "upcoming" | "finished";

export function listTournaments(db: Database.Database, now: Date, tab: Tab, userId: string | null) {
  const nowIso = now.toISOString();
  const rows = (tab === "live"
    ? db.prepare("SELECT * FROM tournaments WHERE status = 'live' ORDER BY ends_at LIMIT 40").all()
    : tab === "upcoming"
      ? db.prepare("SELECT * FROM tournaments WHERE status = 'scheduled' AND starts_at > ? ORDER BY starts_at LIMIT 40").all(nowIso)
      : db.prepare("SELECT * FROM tournaments WHERE status = 'finished' ORDER BY ends_at DESC LIMIT 40").all()) as TournamentRow[];
  return rows.map((t) => {
    const b = boardOf(db, t, now);
    const me = viewerEntry(db, t, b, userId);
    const withdrawn = userId && !me ? myEntry(db, t.id, userId) : null;
    return {
      ...pub(t),
      entrants: b.pool.entrants,
      qualifiedCount: b.qualifiedCount,
      poolCents: b.pool.poolCents,
      firstPrizeCents: b.ladder[0] ?? b.pool.poolCents,
      placesPaid: b.ladder.length || 1,
      my: me ? { rank: me.rank, qualified: me.qualified, betsMade: me.bets_made, score: me.score, stackCents: me.stack_cents, prizeCents: me.prizeCents, finalPrizeCents: me.prize_cents, testAccount: me.testAccount } : withdrawn ? { withdrawn: true } : null,
    };
  });
}

export function tournamentDetail(db: Database.Database, tid: string, now: Date, userId: string | null) {
  const t = getTournament(db, tid);
  const b = boardOf(db, t, now);
  const top = b.rows.slice(0, 10).map((r) => ({ rank: r.rank, name: r.display_name, score: r.score, betsMade: r.bets_made, qualified: r.qualified, prizeCents: t.status === "finished" ? r.prize_cents ?? 0 : r.prizeCents, me: r.user_id === userId }));
  const mine = viewerEntry(db, t, b, userId);
  const fs = feeSplit(t.buyin_cents, t.fee_bps);
  return {
    tournament: pub(t),
    serverNow: now.toISOString(),
    pool: b.pool,
    feeSplit: fs,
    qualifiedCount: b.qualifiedCount,
    fallback: b.fallback,
    ladder: b.ladder,
    legend: ladderLegend(),
    top,
    me: mine ? { rank: mine.rank, name: mine.display_name, score: mine.score, stackCents: mine.stack_cents, betsMade: mine.bets_made, playsUsed: mine.plays_used ?? 0, qualified: mine.qualified, prizeCents: t.status === "finished" ? mine.prize_cents ?? 0 : mine.prizeCents, rebuys: mine.rebuys, status: mine.status, testAccount: mine.testAccount } : null,
    canRebuy: !!(mine && t.status === "live" && t.rebuy_fee_cents && mine.stack_cents <= (t.rebuy_max_balance_cents ?? 0) && mine.rebuys < t.rebuy_limit && now.toISOString() < t.reg_closes_at),
    canWithdraw: !!(mine && mine.bets_made === 0 && !(mine.plays_used ?? 0) && mine.stack_cents >= t.start_stack_cents && t.status !== "finished" && now.toISOString() < t.reg_closes_at),
    regOpen: t.status !== "finished" && now.toISOString() < t.reg_closes_at,
  };
}
