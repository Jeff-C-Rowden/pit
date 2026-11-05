import type Database from "better-sqlite3";

/**
 * Responsible-play limits with real periods.
 *
 * Periods are CALENDAR periods in America/Chicago (not rolling windows):
 *   day   = resets at midnight Chicago time
 *   week  = resets Monday 00:00 Chicago time
 *   month = resets on the 1st at 00:00 Chicago time
 *   all   = legacy all-time limit (limits set before periods existed); never resets
 *
 * Safety rules (enforced here, on the server):
 *   - Tightening (lower amount and same-or-longer period, or adding a limit) applies at once
 *     and cancels any pending loosening for that limit.
 *   - Loosening (higher amount, shorter period, or removal) waits a 24-hour cooling-off.
 *     Until then the current limit stays in force; the change shows as pending.
 */
export const LIMIT_TZ = "America/Chicago";
export const COOL_OFF_MS = 24 * 60 * 60 * 1000;
export type Period = "day" | "week" | "month" | "all";
export const PERIODS: Period[] = ["day", "week", "month"];
const RANK: Record<Period, number> = { day: 1, week: 2, month: 3, all: 4 };
export type LimitKind = "deposit" | "loss";
export type Limit = { cents: number; period: Period } | null;

function offsetMs(at: Date): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: LIMIT_TZ, timeZoneName: "longOffset" })
    .formatToParts(at).find((p) => p.type === "timeZoneName")!.value; // "GMT-06:00"
  const m = s.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) * 60000;
}
function chicagoYMD(at: Date): { y: number; m: number; d: number; dow: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: LIMIT_TZ, year: "numeric", month: "numeric", day: "numeric", weekday: "short" })
    .formatToParts(at).map((p) => [p.type, p.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day), dow };
}
/** UTC instant of 00:00 Chicago time on the given Chicago calendar date (handles DST). */
export function chicagoMidnight(y: number, m: number, d: number): Date {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(new Date(guess));
  t = guess - offsetMs(new Date(t));
  return new Date(t);
}
export function periodWindow(period: Period, now: Date): { start: Date | null; resetsAt: Date | null } {
  if (period === "all") return { start: null, resetsAt: null };
  const { y, m, d, dow } = chicagoYMD(now);
  if (period === "day") return { start: chicagoMidnight(y, m, d), resetsAt: chicagoMidnight(y, m, d + 1) };
  if (period === "week") {
    const back = (dow + 6) % 7; // days since Monday
    return { start: chicagoMidnight(y, m, d - back), resetsAt: chicagoMidnight(y, m, d - back + 7) };
  }
  return { start: chicagoMidnight(y, m, 1), resetsAt: chicagoMidnight(y, m + 1, 1) };
}

export function depositedSince(db: Database.Database, userId: string, since: Date | null): number {
  const r = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS d FROM ledger WHERE user_id = ? AND type = 'deposit' AND created_at >= ?`)
    .get(userId, since ? since.toISOString() : "") as { d: number };
  return r.d;
}
export function netLossSince(db: Database.Database, userId: string, since: Date | null): number {
  const r = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN type = 'bet' THEN -amount_cents ELSE 0 END),0) AS w,
      COALESCE(SUM(CASE WHEN type IN ('payout','refund') THEN amount_cents ELSE 0 END),0) AS r
    FROM ledger WHERE user_id = ? AND created_at >= ?`).get(userId, since ? since.toISOString() : "") as { w: number; r: number };
  return r.w - r.r;
}

type Cols = { cur: string; per: string; pc: string; pp: string; pa: string };
const COLS: Record<LimitKind, Cols> = {
  deposit: { cur: "deposit_limit_cents", per: "deposit_limit_period", pc: "dep_pending_cents", pp: "dep_pending_period", pa: "dep_pending_at" },
  loss: { cur: "loss_limit_cents", per: "loss_limit_period", pc: "loss_pending_cents", pp: "loss_pending_period", pa: "loss_pending_at" },
};

/** Idempotent schema migration. Existing limits become "all" (all-time), which is exactly how they were enforced before. */
export function migrateLimits(db: Database.Database) {
  const have = new Set((db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name));
  for (const k of Object.values(COLS)) {
    for (const [c, t] of [[k.per, "TEXT"], [k.pc, "INTEGER"], [k.pp, "TEXT"], [k.pa, "TEXT"]] as const) {
      if (!have.has(c)) db.exec(`ALTER TABLE users ADD COLUMN ${c} ${t}`);
    }
    db.exec(`UPDATE users SET ${k.per} = 'all' WHERE ${k.cur} IS NOT NULL AND ${k.per} IS NULL`);
  }
}

function asPeriod(p: unknown): Period { return p === "day" || p === "week" || p === "month" ? p : "all"; }

export function isTightening(oldL: Limit, next: Limit): boolean {
  if (next == null) return oldL == null;
  if (oldL == null) return true;
  return next.cents <= oldL.cents && RANK[next.period] >= RANK[oldL.period];
}

/** Promote any pending loosening whose cooling-off has ended. */
export function settlePending(db: Database.Database, userId: string, now = new Date()) {
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as Record<string, unknown> | undefined;
  if (!u) return;
  for (const k of Object.values(COLS)) {
    const at = u[k.pa] as string | null;
    if (at && new Date(at).getTime() <= now.getTime()) {
      db.prepare(`UPDATE users SET ${k.cur} = ?, ${k.per} = ?, ${k.pc} = NULL, ${k.pp} = NULL, ${k.pa} = NULL WHERE id = ?`)
        .run(u[k.pc] ?? null, u[k.pc] == null ? null : u[k.pp], userId);
    }
  }
}

export type LimitView = {
  cents: number | null; period: Period | null; usedCents: number; resetsAt: string | null;
  pending: { cents: number | null; period: Period | null; effectiveAt: string } | null;
};
export function limitView(db: Database.Database, userId: string, kind: LimitKind, now = new Date()): LimitView {
  settlePending(db, userId, now);
  const k = COLS[kind];
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as Record<string, unknown>;
  const cents = (u[k.cur] as number | null) ?? null;
  const period = cents == null ? null : asPeriod(u[k.per]);
  const w = period ? periodWindow(period, now) : { start: null, resetsAt: null };
  const used = cents == null ? 0 : kind === "deposit" ? depositedSince(db, userId, w.start) : netLossSince(db, userId, w.start);
  const pa = u[k.pa] as string | null;
  return {
    cents, period, usedCents: used, resetsAt: w.resetsAt ? w.resetsAt.toISOString() : null,
    pending: pa ? { cents: (u[k.pc] as number | null) ?? null, period: u[k.pc] == null ? null : asPeriod(u[k.pp]), effectiveAt: pa } : null,
  };
}

/** Request a change. Tightening applies now; loosening is queued for 24 hours. */
export function requestLimit(db: Database.Database, userId: string, kind: LimitKind, next: Limit, now = new Date()):
  { applied: "now" | "pending" | "unchanged"; effectiveAt: string | null } {
  settlePending(db, userId, now);
  const k = COLS[kind];
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as Record<string, unknown>;
  const cur: Limit = u[k.cur] == null ? null : { cents: u[k.cur] as number, period: asPeriod(u[k.per]) };
  const same = (cur == null && next == null) || (!!cur && !!next && cur.cents === next.cents && cur.period === next.period);
  if (same) {
    db.prepare(`UPDATE users SET ${k.pc} = NULL, ${k.pp} = NULL, ${k.pa} = NULL WHERE id = ?`).run(userId);
    return { applied: "unchanged", effectiveAt: null };
  }
  if (isTightening(cur, next)) {
    db.prepare(`UPDATE users SET ${k.cur} = ?, ${k.per} = ?, ${k.pc} = NULL, ${k.pp} = NULL, ${k.pa} = NULL WHERE id = ?`)
      .run(next!.cents, next!.period, userId);
    return { applied: "now", effectiveAt: now.toISOString() };
  }
  // Re-sending the change that is already queued keeps its original clock (the Cage form posts both limits on every save).
  if (u[k.pa]) {
    const pc = (u[k.pc] as number | null) ?? null;
    const queued = pc == null ? next == null : !!next && next.cents === pc && next.period === asPeriod(u[k.pp]);
    if (queued) return { applied: "pending", effectiveAt: u[k.pa] as string };
  }
  const at = new Date(now.getTime() + COOL_OFF_MS).toISOString();
  db.prepare(`UPDATE users SET ${k.pc} = ?, ${k.pp} = ?, ${k.pa} = ? WHERE id = ?`)
    .run(next ? next.cents : null, next ? next.period : null, at, userId);
  return { applied: "pending", effectiveAt: at };
}

/** Room left under a limit right now (Infinity when no limit). */
export function roomCents(v: LimitView): number {
  return v.cents == null ? Infinity : v.cents - v.usedCents;
}

/** "Keep my current limit": drop a queued loosening at once (cancelling is never a loosening). */
export function cancelPending(db: Database.Database, userId: string, kind: LimitKind, now = new Date()) {
  settlePending(db, userId, now);
  const k = COLS[kind];
  db.prepare(`UPDATE users SET ${k.pc} = NULL, ${k.pp} = NULL, ${k.pa} = NULL WHERE id = ?`).run(userId);
}
