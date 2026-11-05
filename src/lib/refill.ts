import type Database from "better-sqlite3";
import { limitView, roomCents } from "./limits";

export const REFILL_AMOUNTS = [10000, 5000, 2500, 1000];
export type RefillStatus =
  | { ok: true; amountCents: number; note?: string }
  | { ok: false; reason: "loss_limit" | "deposit_limit"; message: string; resetsAt: string | null };

/** What the one-tap Add chips bar may offer. Limits always win; there is no way around them. */
export function refillStatus(db: Database.Database, userId: string, now = new Date()): RefillStatus {
  const u = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!u) return { ok: false, reason: "deposit_limit", message: "Account not found.", resetsAt: null };
  const loss = limitView(db, userId, "loss", now);
  if (loss.cents != null && loss.usedCents >= loss.cents) {
    return { ok: false, reason: "loss_limit", resetsAt: loss.resetsAt,
      message: "You've reached the loss limit you set, so new bets are paused. Adding chips won't change that." };
  }
  const dep = limitView(db, userId, "deposit", now);
  const room = roomCents(dep);
  const amt = REFILL_AMOUNTS.find((a) => a <= room);
  if (!amt) return { ok: false, reason: "deposit_limit", resetsAt: dep.resetsAt,
    message: "You've reached the deposit limit you set, so no more chips can be added." };
  return amt < REFILL_AMOUNTS[0]
    ? { ok: true, amountCents: amt, note: "Your deposit limit allows this much." }
    : { ok: true, amountCents: amt };
}
