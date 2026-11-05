import type Database from "better-sqlite3";
import { applyLedger, getBalance } from "./ledger";

/** Free sandbox chips, once per America/Chicago calendar day per account. Practice money only. */
export const DAILY_CLAIM_CENTS = 2500;
const TZ = "America/Chicago";

export function chicagoDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** First instant of the next Chicago calendar day (DST-safe: step hours, then minutes). */
export function nextChicagoMidnight(now: Date): Date {
  const today = chicagoDay(now);
  let t = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  while (chicagoDay(t) === today) t = new Date(t.getTime() + 3600_000);
  while (chicagoDay(new Date(t.getTime() - 60_000)) !== today) t = new Date(t.getTime() - 60_000);
  return t;
}

export function dailyKey(userId: string, now: Date): string {
  return `daily-${userId}-${chicagoDay(now)}`;
}

export type DailyStatus = { amountCents: number; claimedToday: boolean; nextClaimAt: string; day: string };

export function dailyStatus(db: Database.Database, userId: string, now: Date): DailyStatus {
  const claimed = !!db.prepare("SELECT 1 FROM ledger WHERE idempotency_key = ?").get(dailyKey(userId, now));
  return { amountCents: DAILY_CLAIM_CENTS, claimedToday: claimed, nextClaimAt: nextChicagoMidnight(now).toISOString(), day: chicagoDay(now) };
}

export type ClaimResult =
  | { ok: true; amountCents: number; balanceCents: number; status: DailyStatus }
  | { ok: false; code: "ALREADY_CLAIMED"; message: string; status: DailyStatus };

/** Server-enforced: the ledger's UNIQUE idempotency key is per user per Chicago day. */
export function claimDaily(db: Database.Database, userId: string, now: Date): ClaimResult {
  const before = dailyStatus(db, userId, now);
  if (before.claimedToday) {
    return { ok: false, code: "ALREADY_CLAIMED", status: before,
      message: "You already claimed today's free chips. The next claim opens at midnight Chicago time." };
  }
  const row = applyLedger({
    userId, type: "deposit", amountCents: DAILY_CLAIM_CENTS, idempotencyKey: dailyKey(userId, now),
    meta: { sandbox: true, daily: true, day: before.day },
  }, db);
  return { ok: true, amountCents: row.amount_cents, balanceCents: getBalance(userId, db), status: dailyStatus(db, userId, now) };
}
