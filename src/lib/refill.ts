import type Database from "better-sqlite3";
import { depositedCents, netLossCents } from "./ledger";

export const REFILL_AMOUNTS = [10000, 5000, 2500, 1000];
export type RefillStatus =
  | { ok: true; amountCents: number; note?: string }
  | { ok: false; reason: "loss_limit" | "deposit_limit"; message: string };

/** What the one-tap Add chips bar may offer. Limits always win; there is no way around them. */
export function refillStatus(db: Database.Database, userId: string): RefillStatus {
  const u = db.prepare("SELECT deposit_limit_cents, loss_limit_cents FROM users WHERE id = ?").get(userId) as
    { deposit_limit_cents: number | null; loss_limit_cents: number | null } | undefined;
  if (!u) return { ok: false, reason: "deposit_limit", message: "Account not found." };
  if (u.loss_limit_cents != null && netLossCents(userId, db) >= u.loss_limit_cents) {
    return { ok: false, reason: "loss_limit", message: "You've reached the loss limit you set, so new bets are paused. Adding chips won't change that." };
  }
  if (u.deposit_limit_cents == null) return { ok: true, amountCents: REFILL_AMOUNTS[0] };
  const room = u.deposit_limit_cents - depositedCents(userId, db);
  const amt = REFILL_AMOUNTS.find((a) => a <= room);
  if (!amt) return { ok: false, reason: "deposit_limit", message: "You've reached the deposit limit you set, so no more chips can be added." };
  return amt < REFILL_AMOUNTS[0]
    ? { ok: true, amountCents: amt, note: "Your deposit limit allows this much." }
    : { ok: true, amountCents: amt };
}
