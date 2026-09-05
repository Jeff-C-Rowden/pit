import { getDb, type LedgerRow, type UserRow } from "./db";
import { newId } from "./rng";
import { assertPositiveCents } from "./money";

export type LedgerType =
  | "deposit"
  | "withdrawal_hold"
  | "bet"
  | "payout"
  | "refund"
  | "commission";

export class LedgerError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function netLossCents(userId: string, db = getDb()): number {
  const row = db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'bet' THEN -amount_cents ELSE 0 END), 0) AS wagered,
       COALESCE(SUM(CASE WHEN type IN ('payout','refund') THEN amount_cents ELSE 0 END), 0) AS returned
     FROM ledger WHERE user_id = ?`
  ).get(userId) as { wagered: number; returned: number };
  // bet amounts are stored negative, so -amount_cents is positive wagered
  return row.wagered - row.returned;
}

function depositedCents(userId: string, db = getDb()): number {
  const row = db.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS d FROM ledger WHERE user_id = ? AND type = 'deposit'`
  ).get(userId) as { d: number };
  return row.d;
}

export function getBalance(userId: string, db = getDb()): number {
  const u = db.prepare("SELECT balance_cents FROM users WHERE id = ?").get(userId) as { balance_cents: number } | undefined;
  if (!u) throw new LedgerError("NO_USER", "user not found");
  return u.balance_cents;
}

export function applyLedger(opts: {
  userId: string;
  type: LedgerType;
  amountCents: number;
  game?: string | null;
  ref?: string | null;
  idempotencyKey: string;
  meta?: unknown;
}, db = getDb()): LedgerRow {
  const existing = db.prepare("SELECT * FROM ledger WHERE idempotency_key = ?").get(opts.idempotencyKey) as LedgerRow | undefined;
  if (existing) return existing;

  const amount = opts.amountCents;
  if (!Number.isInteger(amount) || amount === 0) {
    throw new LedgerError("BAD_AMOUNT", "ledger amount must be a non-zero integer");
  }
  if (opts.type === "bet" && amount >= 0) throw new LedgerError("BAD_AMOUNT", "bets must debit");
  if (opts.type === "payout" && amount <= 0) throw new LedgerError("BAD_AMOUNT", "payouts must credit");
  if (opts.type === "deposit" && amount <= 0) throw new LedgerError("BAD_AMOUNT", "deposits must credit");
  if (opts.type === "withdrawal_hold" && amount >= 0) throw new LedgerError("BAD_AMOUNT", "withdrawal holds must debit");

  const run = db.transaction(() => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(opts.userId) as UserRow | undefined;
    if (!user) throw new LedgerError("NO_USER", "user not found");

    if (opts.type === "deposit" && user.deposit_limit_cents != null) {
      const nextDep = depositedCents(opts.userId, db) + amount;
      if (nextDep > user.deposit_limit_cents) {
        throw new LedgerError("DEPOSIT_LIMIT", "deposit would exceed your limit");
      }
    }

    if (opts.type === "bet" && user.loss_limit_cents != null) {
      const nextLoss = netLossCents(opts.userId, db) + -amount;
      if (nextLoss > user.loss_limit_cents) {
        throw new LedgerError("LOSS_LIMIT", "this wager would exceed your loss limit");
      }
    }

    const next = user.balance_cents + amount;
    if (next < 0) throw new LedgerError("INSUFFICIENT_FUNDS", "insufficient funds");

    db.prepare("UPDATE users SET balance_cents = ? WHERE id = ?").run(next, opts.userId);
    const row: LedgerRow = {
      id: newId(),
      user_id: opts.userId,
      type: opts.type,
      amount_cents: amount,
      balance_after_cents: next,
      game: opts.game ?? null,
      ref: opts.ref ?? null,
      idempotency_key: opts.idempotencyKey,
      meta: opts.meta == null ? null : JSON.stringify(opts.meta),
      created_at: new Date().toISOString(),
    };
    try {
      db.prepare(
        `INSERT INTO ledger (id, user_id, type, amount_cents, balance_after_cents, game, ref, idempotency_key, meta, created_at)
         VALUES (@id, @user_id, @type, @amount_cents, @balance_after_cents, @game, @ref, @idempotency_key, @meta, @created_at)`
      ).run(row);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("UNIQUE")) {
        return db.prepare("SELECT * FROM ledger WHERE idempotency_key = ?").get(opts.idempotencyKey) as LedgerRow;
      }
      throw e;
    }
    return row;
  });

  return run();
}

export function debitBet(userId: string, amountCents: number, game: string, ref: string, idempotencyKey: string, meta?: unknown, db = getDb()) {
  assertPositiveCents(amountCents);
  return applyLedger({ userId, type: "bet", amountCents: -amountCents, game, ref, idempotencyKey, meta }, db);
}

export function creditPayout(userId: string, amountCents: number, game: string, ref: string, idempotencyKey: string, meta?: unknown, db = getDb()) {
  if (amountCents === 0) {
    return applyLedger({ userId, type: "payout", amountCents: 0, game, ref, idempotencyKey, meta }, db);
  }
  assertPositiveCents(amountCents);
  return applyLedger({ userId, type: "payout", amountCents, game, ref, idempotencyKey, meta }, db);
}

export function saveGame(opts: {
  id: string;
  userId: string;
  game: string;
  status: "open" | "settled";
  state: unknown;
}, db = getDb()) {
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT id FROM game_states WHERE id = ?").get(opts.id) as { id: string } | undefined;
  const json = JSON.stringify(opts.state);
  if (existing) {
    db.prepare("UPDATE game_states SET status = ?, state_json = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(opts.status, json, now, opts.id, opts.userId);
  } else {
    db.prepare(
      `INSERT INTO game_states (id, user_id, game, status, state_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(opts.id, opts.userId, opts.game, opts.status, json, now, now);
  }
}

export function loadGame<T>(id: string, userId: string, db = getDb()): { id: string; status: string; state: T } | null {
  const row = db.prepare("SELECT * FROM game_states WHERE id = ? AND user_id = ?").get(id, userId) as
    | { id: string; status: string; state_json: string }
    | undefined;
  if (!row) return null;
  return { id: row.id, status: row.status, state: JSON.parse(row.state_json) as T };
}

export function loadOpenGame<T>(userId: string, game: string, db = getDb()): { id: string; status: string; state: T } | null {
  const row = db.prepare("SELECT * FROM game_states WHERE user_id = ? AND game = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1")
    .get(userId, game) as { id: string; status: string; state_json: string } | undefined;
  if (!row) return null;
  return { id: row.id, status: row.status, state: JSON.parse(row.state_json) as T };
}
