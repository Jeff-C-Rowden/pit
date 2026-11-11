/**
 * Casino-wide bonus money (sandbox).
 *
 * - Bonus is a separate, play-only balance (users.bonus_cents). It is never withdrawable and
 *   every bonus movement is a ledger row with currency = 'bonus'.
 * - Bonus can be played on the slots listed in BONUS_PLAYABLE. Table games, the progressive and
 *   tournaments take cash only.
 * - Funding order: cash first, then bonus. On a "Bonus to Cash" machine the order flips (bonus
 *   first), because spending bonus is what those machines are for.
 * - Winnings follow the money that funded the bet, pro rata. The bonus-funded share of a win
 *   stays bonus, EXCEPT on Bonus to Cash machines (bonus_cash_eligible), where it pays as cash.
 *   The bonus stake itself is always consumed.
 */
import type Database from "better-sqlite3";
import { applyLedger, LedgerError } from "./ledger";
import { getDb } from "./db";
import { assertPositiveCents } from "./money";

/** Games where bonus money may be bet. */
export const BONUS_PLAYABLE = new Set(["buckshot", "slot", "bounty"]);
/** Main-floor machines whose bonus-funded winnings pay out as CASH (admin flag). */
export const BONUS_CASH_ELIGIBLE = new Set(["bounty"]);

export function isBonusCashEligible(game: string): boolean {
  return BONUS_CASH_ELIGIBLE.has(game);
}

export type BetSplit = { cashCents: number; bonusCents: number };

/** Pure: how a bet of `bet` is funded from `cash` and `bonus`. */
export function splitBet(bet: number, cash: number, bonus: number, bonusFirst = false): BetSplit {
  assertPositiveCents(bet);
  if (cash + bonus < bet) throw new LedgerError("INSUFFICIENT_FUNDS", "insufficient funds");
  if (bonusFirst) {
    const b = Math.min(bet, bonus);
    return { cashCents: bet - b, bonusCents: b };
  }
  const c = Math.min(bet, cash);
  return { cashCents: c, bonusCents: bet - c };
}

export type WinSplit = { cashCents: number; bonusCents: number; convertedCents: number };

/**
 * Pure: route a win. The bonus-funded share (floor of win × bonus / bet) stays bonus unless the
 * machine is Bonus to Cash, in which case it is paid as cash and reported as `convertedCents`.
 */
export function splitWin(win: number, split: BetSplit, eligible: boolean): WinSplit {
  if (!Number.isInteger(win) || win < 0) throw new Error("win must be a non-negative integer");
  const bet = split.cashCents + split.bonusCents;
  if (win === 0 || bet === 0) return { cashCents: 0, bonusCents: 0, convertedCents: 0 };
  const bonusShare = Math.floor((win * split.bonusCents) / bet);
  if (eligible) return { cashCents: win, bonusCents: 0, convertedCents: bonusShare };
  return { cashCents: win - bonusShare, bonusCents: bonusShare, convertedCents: 0 };
}

function balances(db: Database.Database, userId: string) {
  const u = db.prepare("SELECT balance_cents AS c, bonus_cents AS b FROM users WHERE id = ?").get(userId) as { c: number; b: number } | undefined;
  if (!u) throw new LedgerError("NO_USER", "user not found");
  return u;
}

/** Debit a slot bet from cash and/or bonus, idempotently. Returns the split actually used. */
export function debitPlayBet(userId: string, bet: number, game: string, ref: string, key: string, meta?: Record<string, unknown>, db = getDb()): BetSplit {
  if (!BONUS_PLAYABLE.has(game)) {
    applyLedger({ userId, type: "bet", amountCents: -bet, game, ref, idempotencyKey: key, meta }, db);
    return { cashCents: bet, bonusCents: 0 };
  }
  return db.transaction(() => {
    const prior = db.prepare("SELECT amount_cents AS a, currency FROM ledger WHERE idempotency_key IN (?, ?)").all(key, `${key}:bonus`) as { a: number; currency: string }[];
    if (prior.length) {
      return {
        cashCents: -prior.filter((r) => r.currency === "cash").reduce((s, r) => s + r.a, 0),
        bonusCents: -prior.filter((r) => r.currency === "bonus").reduce((s, r) => s + r.a, 0),
      };
    }
    const { c, b } = balances(db, userId);
    const split = splitBet(bet, c, b, isBonusCashEligible(game));
    if (split.cashCents > 0) applyLedger({ userId, type: "bet", amountCents: -split.cashCents, game, ref, idempotencyKey: key, meta: { ...meta, funded: split } }, db);
    if (split.bonusCents > 0) applyLedger({ userId, type: "bet", amountCents: -split.bonusCents, game, ref, idempotencyKey: `${key}:bonus`, meta: { ...meta, funded: split }, currency: "bonus" }, db);
    return split;
  })();
}

/** Credit a slot win according to how the bet was funded. */
export function creditPlayWin(userId: string, win: number, game: string, ref: string, key: string, split: BetSplit, meta?: Record<string, unknown>, db = getDb()): WinSplit {
  const w = splitWin(win, split, isBonusCashEligible(game));
  db.transaction(() => {
    if (w.cashCents > 0) applyLedger({ userId, type: "payout", amountCents: w.cashCents, game, ref, idempotencyKey: key, meta: w.convertedCents ? { ...meta, bonusToCashCents: w.convertedCents } : meta }, db);
    if (w.bonusCents > 0) applyLedger({ userId, type: "payout", amountCents: w.bonusCents, game, ref, idempotencyKey: `${key}:bonus`, meta, currency: "bonus" }, db);
  })();
  return w;
}

/** Sandbox-only test bonus, like the Cage's test funds: $5 once per Chicago day. */
export const TEST_BONUS_CENTS = 500;
export function grantTestBonus(userId: string, day: string, db = getDb()) {
  return applyLedger({ userId, type: "promo", amountCents: TEST_BONUS_CENTS, idempotencyKey: `test-bonus-${userId}-${day}`, meta: { sandbox: true, testBonus: true, day }, currency: "bonus" }, db);
}

/** Credit bonus money (tournament prizes and test grants). */
export function creditBonus(userId: string, cents: number, game: string | null, ref: string | null, key: string, meta?: unknown, type: "payout" | "promo" = "payout", db = getDb()) {
  assertPositiveCents(cents);
  return applyLedger({ userId, type, amountCents: cents, game, ref, idempotencyKey: key, meta, currency: "bonus" }, db);
}
