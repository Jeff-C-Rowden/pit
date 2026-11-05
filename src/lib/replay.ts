// Read-only views of results that already settled, built from the ledger.
// Nothing here moves money or changes a game.
import type Database from "better-sqlite3";
import { lastSettledSpin } from "@/lib/games/roulette";
import { publicBlackjack } from "@/lib/games/blackjack";
import { publicPaiGow } from "@/lib/games/paigow";
import { publicHoldem } from "@/lib/games/holdem";

export type LedgerLine = { id: string; type: string; amountCents: number; balanceAfterCents: number; game: string | null; ref: string | null; at: string };

export function ledgerLines(db: Database.Database, userId: string, opts: { game?: string; ref?: string; limit?: number } = {}): LedgerLine[] {
  const where = ["user_id = ?"]; const args: unknown[] = [userId];
  if (opts.game) { where.push("game = ?"); args.push(opts.game); }
  if (opts.ref) { where.push("ref = ?"); args.push(opts.ref); }
  const limit = Math.min(Math.max(1, opts.limit || 30), 100);
  const rows = db.prepare(`SELECT id, type, amount_cents, balance_after_cents, game, ref, created_at FROM ledger WHERE ${where.join(" AND ")} ORDER BY created_at DESC, rowid DESC LIMIT ?`)
    .all(...args, limit) as { id: string; type: string; amount_cents: number; balance_after_cents: number; game: string | null; ref: string | null; created_at: string }[];
  return rows.map((r) => ({ id: r.id, type: r.type, amountCents: r.amount_cents, balanceAfterCents: r.balance_after_cents, game: r.game, ref: r.ref, at: r.created_at }));
}

function sums(db: Database.Database, userId: string, game: string, ref: string) {
  return db.prepare(
    "SELECT COALESCE(SUM(CASE WHEN type = 'bet' THEN -amount_cents ELSE 0 END), 0) AS stake, " +
    "COALESCE(SUM(CASE WHEN type IN ('payout','refund') THEN amount_cents ELSE 0 END), 0) AS paid " +
    "FROM ledger WHERE user_id = ? AND game = ? AND ref = ?",
  ).get(userId, game, ref) as { stake: number; paid: number };
}

/** Last settled blackjack hand: cards from the saved hand, money from the ledger. */
export function lastBlackjack(db: Database.Database, userId: string) {
  const row = db.prepare("SELECT id, state_json, updated_at FROM game_states WHERE user_id = ? AND game = 'blackjack' AND status = 'settled' ORDER BY updated_at DESC, rowid DESC LIMIT 1")
    .get(userId) as { id: string; state_json: string; updated_at: string } | undefined;
  if (!row) return null;
  const s = sums(db, userId, "blackjack", row.id);
  if (!s.stake) return null;
  const pub = publicBlackjack(JSON.parse(row.state_json), true);
  return { game: "blackjack" as const, ref: row.id, at: row.updated_at, stakeCents: s.stake, payoutCents: s.paid, netCents: s.paid - s.stake,
    result: pub.result, dealer: pub.dealer, playerHands: pub.playerHands };
}

/** Last craps roll: dice from the saved table, paid amount from the ledger (no line = nothing paid). */
export function lastCrapsRoll(db: Database.Database, userId: string) {
  const rows = db.prepare("SELECT state_json FROM game_states WHERE user_id = ? AND game = 'craps' ORDER BY updated_at DESC, rowid DESC LIMIT 5")
    .all(userId) as { state_json: string }[];
  for (const row of rows) {
    let st: { lastRollRecord?: { ref: string; dice: [number, number]; riskedCents: number; at: string } };
    try { st = JSON.parse(row.state_json); } catch { continue; }
    const rec = st.lastRollRecord;
    if (!rec || !Array.isArray(rec.dice)) continue;
    const paid = db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS p FROM ledger WHERE user_id = ? AND game = 'craps' AND type = 'payout' AND ref = ?")
      .get(userId, rec.ref) as { p: number };
    return { game: "craps" as const, ref: rec.ref, at: rec.at, dice: rec.dice, total: rec.dice[0] + rec.dice[1],
      riskedCents: Number(rec.riskedCents) || 0, payoutCents: paid.p };
  }
  return null;
}

export function lastRoulette(db: Database.Database, userId: string) {
  const s = lastSettledSpin(db, userId);
  return s ? { game: "roulette" as const, ref: s.id, ...s } : null;
}

export function cageHref(game: string, ref: string) {
  return `/wallet?game=${encodeURIComponent(game)}&ref=${encodeURIComponent(ref)}#ledger`;
}

function sumsFor(db: Database.Database, userId: string, game: string, ref: string) { return sums(db, userId, game, ref); }

/** Bet lines for a craps roll: the ids saved with that roll, looked up in the ledger. */
export function crapsRollBetLines(db: Database.Database, userId: string, rollRef: string): LedgerLine[] {
  const rows = db.prepare("SELECT state_json FROM game_states WHERE user_id = ? AND game = 'craps' ORDER BY updated_at DESC, rowid DESC LIMIT 10").all(userId) as { state_json: string }[];
  for (const r of rows) {
    let st: { rollLog?: { ref: string; betLineIds?: string[] }[] };
    try { st = JSON.parse(r.state_json); } catch { continue; }
    const rec = (st.rollLog || []).find((x) => x.ref === rollRef);
    if (!rec) continue;
    const ids = rec.betLineIds || [];
    if (!ids.length) return [];
    const q = db.prepare(`SELECT id, type, amount_cents, balance_after_cents, game, ref, created_at FROM ledger WHERE user_id = ? AND id IN (${ids.map(() => "?").join(",")}) ORDER BY rowid DESC`)
      .all(userId, ...ids) as { id: string; type: string; amount_cents: number; balance_after_cents: number; game: string | null; ref: string | null; created_at: string }[];
    return q.map((x) => ({ id: x.id, type: x.type, amountCents: x.amount_cents, balanceAfterCents: x.balance_after_cents, game: x.game, ref: x.ref, at: x.created_at }));
  }
  return [];
}

function lastSettledState(db: Database.Database, userId: string, game: string) {
  return db.prepare("SELECT id, state_json, updated_at FROM game_states WHERE user_id = ? AND game = ? AND status = 'settled' ORDER BY updated_at DESC, rowid DESC LIMIT 1")
    .get(userId, game) as { id: string; state_json: string; updated_at: string } | undefined;
}

export function lastPaigow(db: Database.Database, userId: string) {
  const row = lastSettledState(db, userId, "paigow");
  if (!row) return null;
  const s = sumsFor(db, userId, "paigow", row.id);
  if (!s.stake) return null;
  const pub = publicPaiGow(JSON.parse(row.state_json));
  return { game: "paigow" as const, ref: row.id, at: row.updated_at, stakeCents: s.stake, payoutCents: s.paid, netCents: s.paid - s.stake,
    result: pub.result, playerHigh: pub.playerHigh, playerLow: pub.playerLow, dealerHigh: pub.dealerHigh, dealerLow: pub.dealerLow };
}

export function lastHoldem(db: Database.Database, userId: string) {
  const row = lastSettledState(db, userId, "holdem");
  if (!row) return null;
  const s = sumsFor(db, userId, "holdem", row.id);
  if (!s.stake) return null;
  const pub = publicHoldem(JSON.parse(row.state_json));
  return { game: "holdem" as const, ref: row.id, at: row.updated_at, stakeCents: s.stake, payoutCents: s.paid, netCents: s.paid - s.stake,
    result: pub.result, winner: pub.winner, board: pub.board, playerHole: pub.playerHole, houseHole: pub.houseHole,
    playerHandName: pub.playerHandName, houseHandName: pub.houseHandName };
}

export type RecentResult = { ref: string; at: string; netCents: number | null; paidCents: number; label: string };

/** The last few settled results for a table, money from the ledger. Newest first. */
export function recentResults(db: Database.Database, userId: string, game: string, n = 5): RecentResult[] {
  n = Math.min(Math.max(1, n), 10);
  if (game === "craps") {
    const row = db.prepare("SELECT state_json FROM game_states WHERE user_id = ? AND game = 'craps' ORDER BY updated_at DESC, rowid DESC LIMIT 1").get(userId) as { state_json: string } | undefined;
    if (!row) return [];
    let st: { rollLog?: { ref: string; dice: [number, number]; at: string }[]; lastRollRecord?: { ref: string; dice: [number, number]; at: string } };
    try { st = JSON.parse(row.state_json); } catch { return []; }
    const log = st.rollLog?.length ? st.rollLog : st.lastRollRecord ? [st.lastRollRecord] : [];
    return log.slice(-n).reverse().map((r) => {
      const p = (db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS p FROM ledger WHERE user_id = ? AND game = 'craps' AND type = 'payout' AND ref = ?").get(userId, r.ref) as { p: number }).p;
      return { ref: r.ref, at: r.at, netCents: null, paidCents: p, label: String(r.dice[0] + r.dice[1]) };
    });
  }
  let rows: { id: string; at: string }[];
  if (game === "roulette") {
    rows = db.prepare("SELECT id, created_at AS at FROM roulette_spins WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?").all(userId, n) as { id: string; at: string }[];
  } else if (["blackjack", "paigow", "holdem"].includes(game)) {
    rows = db.prepare("SELECT id, updated_at AS at FROM game_states WHERE user_id = ? AND game = ? AND status = 'settled' ORDER BY updated_at DESC, rowid DESC LIMIT ?").all(userId, game, n) as { id: string; at: string }[];
  } else return [];
  const out: RecentResult[] = [];
  for (const r of rows) {
    const s = sumsFor(db, userId, game, r.id);
    if (!s.stake) continue; // no money on it (e.g. a closed hand): not a result
    const net = s.paid - s.stake;
    out.push({ ref: r.id, at: r.at, netCents: net, paidCents: s.paid, label: net > 0 ? "W" : net < 0 ? "L" : "P" });
  }
  return out;
}
