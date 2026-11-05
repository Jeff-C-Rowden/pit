import type Database from "better-sqlite3";
import { COOL_OFF_MS } from "./limits";

/**
 * Play sessions, reality checks and an optional session time limit.
 *
 * A session is derived only from the ledger (nothing invented): it is the unbroken run of
 * wagers/results where no gap is BREAK_MS or longer. Net is the real ledger sum of results
 * minus wagers in that run. A session ends after a BREAK_MS pause with no play.
 *
 * Settings follow the same rules as money limits: adding or shortening applies at once;
 * lengthening or removing waits the 24-hour cooling-off.
 * The session limit only stops NEW wagers; anything already in play still settles and pays.
 */
export const BREAK_MS = 30 * 60 * 1000;
export const REALITY_CHOICES = [15, 30, 45, 60];
export const SESSION_CHOICES = [30, 60, 90, 120, 180, 240];
export type SettingKind = "reality" | "session";
const COLS: Record<SettingKind, { cur: string; pv: string; pa: string }> = {
  reality: { cur: "reality_check_min", pv: "reality_pending_min", pa: "reality_pending_at" },
  session: { cur: "session_limit_min", pv: "session_pending_min", pa: "session_pending_at" },
};

export function migrateSession(db: Database.Database) {
  const have = new Set((db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name));
  for (const c of ["reality_check_min INTEGER", "reality_pending_min INTEGER", "reality_pending_at TEXT", "session_limit_min INTEGER", "session_pending_min INTEGER", "session_pending_at TEXT"]) {
    if (!have.has(c.split(" ")[0])) db.exec(`ALTER TABLE users ADD COLUMN ${c}`);
  }
}

export type Session = { active: boolean; startedAt: string | null; lastAt: string | null; minutes: number; netCents: number; breakEndsAt: string | null };

export function currentSession(db: Database.Database, userId: string, now = new Date()): Session {
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const rows = db.prepare(`SELECT type, amount_cents AS a, created_at AS t FROM ledger
    WHERE user_id = ? AND type IN ('bet','payout','refund') AND created_at >= ? ORDER BY created_at DESC`).all(userId, since) as { type: string; a: number; t: string }[];
  if (!rows.length || now.getTime() - Date.parse(rows[0].t) >= BREAK_MS) {
    return { active: false, startedAt: null, lastAt: rows[0]?.t ?? null, minutes: 0, netCents: 0, breakEndsAt: null };
  }
  let start = rows[0].t; let net = 0;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && Date.parse(rows[i - 1].t) - Date.parse(rows[i].t) >= BREAK_MS) break;
    start = rows[i].t; net += rows[i].a;
  }
  return { active: true, startedAt: start, lastAt: rows[0].t, minutes: Math.floor((now.getTime() - Date.parse(start)) / 60000), netCents: net,
    breakEndsAt: new Date(Date.parse(rows[0].t) + BREAK_MS).toISOString() };
}

export function settleSettings(db: Database.Database, userId: string, now = new Date()) {
  for (const k of Object.values(COLS)) {
    db.prepare(`UPDATE users SET ${k.cur} = ${k.pv}, ${k.pv} = NULL, ${k.pa} = NULL WHERE id = ? AND ${k.pa} IS NOT NULL AND ${k.pa} <= ?`).run(userId, now.toISOString());
  }
}

export type SettingView = { minutes: number | null; pending: { minutes: number | null; effectiveAt: string } | null };
export function settingView(db: Database.Database, userId: string, kind: SettingKind, now = new Date()): SettingView {
  settleSettings(db, userId, now);
  const k = COLS[kind];
  const u = db.prepare(`SELECT ${k.cur} AS c, ${k.pv} AS v, ${k.pa} AS a FROM users WHERE id = ?`).get(userId) as { c: number | null; v: number | null; a: string | null } | undefined;
  return { minutes: u?.c ?? null, pending: u?.a ? { minutes: u.v ?? null, effectiveAt: u.a } : null };
}

export function requestSetting(db: Database.Database, userId: string, kind: SettingKind, next: number | null, now = new Date()):
  { applied: "now" | "pending" | "unchanged"; effectiveAt: string | null } {
  const choices = kind === "reality" ? REALITY_CHOICES : SESSION_CHOICES;
  if (next != null && !choices.includes(next)) throw new Error(`pick one of ${choices.join(", ")} minutes`);
  const v = settingView(db, userId, kind, now); const k = COLS[kind];
  if (v.minutes === next) {
    db.prepare(`UPDATE users SET ${k.pv} = NULL, ${k.pa} = NULL WHERE id = ?`).run(userId);
    return { applied: "unchanged", effectiveAt: null };
  }
  if (next != null && (v.minutes == null || next < v.minutes)) {
    db.prepare(`UPDATE users SET ${k.cur} = ?, ${k.pv} = NULL, ${k.pa} = NULL WHERE id = ?`).run(next, userId);
    return { applied: "now", effectiveAt: now.toISOString() };
  }
  if (v.pending && v.pending.minutes === next) return { applied: "pending", effectiveAt: v.pending.effectiveAt };
  const at = new Date(now.getTime() + COOL_OFF_MS).toISOString();
  db.prepare(`UPDATE users SET ${k.pv} = ?, ${k.pa} = ? WHERE id = ?`).run(next, at, userId);
  return { applied: "pending", effectiveAt: at };
}

export function cancelSettingPending(db: Database.Database, userId: string, kind: SettingKind, now = new Date()) {
  settleSettings(db, userId, now);
  const k = COLS[kind];
  db.prepare(`UPDATE users SET ${k.pv} = NULL, ${k.pa} = NULL WHERE id = ?`).run(userId);
}

/** Throws a message if a NEW wager must be refused because the session time limit is used up. */
export function sessionBlock(db: Database.Database, userId: string, now = new Date()): { endsAt: string; breakEndsAt: string } | null {
  const lim = settingView(db, userId, "session", now).minutes;
  if (lim == null) return null;
  const s = currentSession(db, userId, now);
  if (!s.active || !s.startedAt) return null;
  const endsAt = Date.parse(s.startedAt) + lim * 60000;
  return now.getTime() >= endsAt ? { endsAt: new Date(endsAt).toISOString(), breakEndsAt: s.breakEndsAt! } : null;
}
