import * as ledger from "./ledger";
import type { HoldemState } from "./games/holdem";

export function holdemDone(s: HoldemState) {
  return s.street === "showdown" || s.street === "folded";
}

/** Full pot on a player win, half on a split, 0 on a loss. */
export function holdemCreditCents(s: HoldemState): number {
  if (!holdemDone(s)) return 0;
  if (s.winner === "player") return s.pot;
  if (s.winner === "split") return Math.floor(s.pot / 2);
  return 0;
}

/**
 * Persist a hold'em hand. Credits the ledger before marking the hand settled so a
 * failed payout cannot silently close an unpaid pot.
 */
export function persistHoldem(userId: string, s: HoldemState) {
  const isDone = holdemDone(s);
  if (!isDone) {
    ledger.saveGame({ id: s.id, userId, game: "holdem", status: "open", state: s });
    return;
  }
  const pay = holdemCreditCents(s);
  s.payoutCents = pay;
  if (pay > 0) {
    try {
      ledger.creditPayout(userId, pay, "holdem", s.id, `he-pay-${s.id}`);
    } catch (e) {
      ledger.saveGame({ id: s.id, userId, game: "holdem", status: "open", state: s });
      throw e;
    }
  }
  ledger.saveGame({ id: s.id, userId, game: "holdem", status: "settled", state: s });
}
