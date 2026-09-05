import { describe, it, expect, beforeEach, vi } from "vitest";
import { bestHand, cmpRanked, startHoldem, playerAct, BB } from "../src/lib/games/holdem";
import type { Card } from "../src/lib/games/cards";
import { resetDbForTests, getDb } from "../src/lib/db";
import { applyLedger, debitBet, getBalance, loadGame } from "../src/lib/ledger";
import * as ledger from "../src/lib/ledger";
import { persistHoldem, holdemCreditCents } from "../src/lib/holdemPersist";

const C = (rank: Card["rank"], suit: Card["suit"]): Card => ({ rank, suit });

describe("hold'em ranking", () => {
  it("royal flush beats quads", () => {
    const royal = bestHand([C(1,"s"), C(13,"s")], [C(12,"s"), C(11,"s"), C(10,"s"), C(2,"d"), C(3,"c")]);
    const quads = bestHand([C(9,"s"), C(9,"h")], [C(9,"d"), C(9,"c"), C(2,"s"), C(3,"d"), C(4,"h")]);
    expect(royal.name).toBe("royal flush");
    expect(quads.name).toBe("four of a kind");
    expect(cmpRanked(royal, quads)).toBeGreaterThan(0);
  });

  it("wheel straight is 5-high", () => {
    const wheel = bestHand([C(1,"s"), C(2,"h")], [C(3,"d"), C(4,"c"), C(5,"s"), C(9,"d"), C(9,"c")]);
    expect(wheel.name).toBe("straight");
    expect(wheel.kickers[0]).toBe(5);
  });

  it("higher pair wins", () => {
    const a = bestHand([C(13,"s"), C(13,"h")], [C(2,"d"), C(3,"c"), C(7,"s"), C(8,"d"), C(10,"c")]);
    const b = bestHand([C(12,"s"), C(12,"h")], [C(2,"d"), C(3,"c"), C(7,"s"), C(8,"d"), C(10,"c")]);
    expect(cmpRanked(a, b)).toBeGreaterThan(0);
  });
});

function seed(id = "u1") {
  const db = resetDbForTests();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, created_at)
     VALUES (?, ?, 'hash', ?, 1, 0, 0, datetime('now'))`
  ).run(id, `${id}@pit.test`, "Tester");
  return id;
}

describe("hold'em payout ledger", () => {
  beforeEach(() => {
    seed();
    applyLedger({ userId: "u1", type: "deposit", amountCents: 10000, idempotencyKey: "he-dep" });
  });

  function forcePlayerWin(state: ReturnType<typeof startHoldem>["state"]) {
    state.houseFolded = true;
    state.playerFolded = false;
    state.street = "folded";
    state.toAct = "none";
    state.winner = "player";
    state.result = "House folded";
    state.payoutCents = 0; // persist must ignore this and credit the full pot
  }

  it("credits the full pot (player bets + house bets) on a player win", () => {
    const start = getBalance("u1");
    const { state, playerBlind } = startHoldem(true);
    debitBet("u1", playerBlind, "holdem", state.id, "he-blind");
    persistHoldem("u1", state);
    expect(loadGame(state.id, "u1")?.status).toBe("open");

    const pot = state.pot;
    expect(pot).toBe(playerBlind + BB);
    forcePlayerWin(state);
    persistHoldem("u1", state);

    expect(holdemCreditCents(state)).toBe(pot);
    expect(state.payoutCents).toBe(pot);
    expect(getBalance("u1")).toBe(start - playerBlind + pot);
    expect(loadGame(state.id, "u1")?.status).toBe("settled");

    const pay = getDb().prepare("SELECT * FROM ledger WHERE type = 'payout' AND ref = ?").get(state.id) as { amount_cents: number };
    expect(pay.amount_cents).toBe(pot);
  });

  it("credits half the pot on a split and 0 on a loss", () => {
    const start = getBalance("u1");
    const { state, playerBlind } = startHoldem(true);
    debitBet("u1", playerBlind, "holdem", state.id, "he-blind-split");
    const pot = state.pot;

    state.street = "showdown";
    state.toAct = "none";
    state.winner = "split";
    state.result = "Split pot";
    persistHoldem("u1", state);
    expect(getBalance("u1")).toBe(start - playerBlind + Math.floor(pot / 2));
    expect(state.payoutCents).toBe(Math.floor(pot / 2));

    const { state: loss, playerBlind: pb2 } = startHoldem(true);
    debitBet("u1", pb2, "holdem", loss.id, "he-blind-loss");
    const afterBlind = getBalance("u1");
    loss.street = "folded";
    loss.toAct = "none";
    loss.winner = "house";
    loss.playerFolded = true;
    loss.result = "You folded";
    persistHoldem("u1", loss);
    expect(getBalance("u1")).toBe(afterBlind);
    expect(loss.payoutCents).toBe(0);
    expect(loadGame(loss.id, "u1")?.status).toBe("settled");
  });

  it("does not settle the hand if creditPayout throws", () => {
    const start = getBalance("u1");
    const { state, playerBlind } = startHoldem(true);
    debitBet("u1", playerBlind, "holdem", state.id, "he-blind-fail");
    forcePlayerWin(state);
    const spy = vi.spyOn(ledger, "creditPayout").mockImplementation(() => {
      throw new Error("payout failed");
    });
    try {
      expect(() => persistHoldem("u1", state)).toThrow(/payout failed/);
      expect(loadGame(state.id, "u1")?.status).toBe("open");
      expect(getBalance("u1")).toBe(start - playerBlind);
    } finally {
      spy.mockRestore();
    }
  });

  it("player fold settles with no payout", () => {
    const start = getBalance("u1");
    const { state, playerBlind } = startHoldem(true);
    debitBet("u1", playerBlind, "holdem", state.id, "he-blind-fold");
    if (state.toAct !== "player") throw new Error("expected player to act");
    playerAct(state, { type: "fold" });
    persistHoldem("u1", state);
    expect(state.winner).toBe("house");
    expect(holdemCreditCents(state)).toBe(0);
    expect(getBalance("u1")).toBe(start - playerBlind);
    expect(loadGame(state.id, "u1")?.status).toBe("settled");
  });
});
