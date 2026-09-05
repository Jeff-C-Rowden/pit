import { describe, it, expect } from "vitest";
import { startBlackjackWithCards, hit, stand, double, split, takeInsurance, abandonHand } from "../src/lib/games/blackjack";
import type { Card } from "../src/lib/games/cards";

const c = (rank: Card["rank"], suit: Card["suit"] = "s"): Card => ({ rank, suit });

describe("blackjack rules", () => {
  it("pays 3:2 on player blackjack vs non-bj dealer", () => {
    const s = startBlackjackWithCards(1000, [c(1), c(10), c(9), c(5), c(2)]);
    expect(s.phase).toBe("settled");
    expect(s.result).toBe("blackjack");
    expect(s.payoutCents).toBe(2500);
  });

  it("pushes both blackjacks", () => {
    const s = startBlackjackWithCards(1000, [c(1), c(10), c(1), c(13)]);
    expect(s.payoutCents).toBe(1000);
    expect(s.result).toBe("push");
  });

  it("dealer stands on soft 17", () => {
    // player 19 (9,10), dealer Ace+6 then would have drawn if H17
    const s = startBlackjackWithCards(1000, [c(9), c(10), c(1), c(6)]);
    const afterIns = takeInsurance(s, false);
    const done = stand(afterIns);
    expect(done.phase).toBe("settled");
    expect(done.dealer.length).toBe(2);
    expect(done.result).toMatch(/win/);
    expect(done.payoutCents).toBe(2000);
  });

  it("busts a hit over 21", () => {
    const s = startBlackjackWithCards(1000, [c(10), c(9), c(7), c(8), c(5)]);
    const d = hit(s);
    expect(d.playerHands[0]!.bust).toBe(true);
    expect(d.payoutCents).toBe(0);
  });

  it("doubles and stands after one card", () => {
    const s = startBlackjackWithCards(1000, [c(5), c(6), c(10), c(9), c(10)]);
    const { extraBet, state } = double(s);
    expect(extraBet).toBe(1000);
    expect(state.playerHands[0]!.doubled).toBe(true);
    expect(state.playerHands[0]!.cards.length).toBe(3);
    expect(state.phase).toBe("settled");
  });

  it("splits a pair once", () => {
    const s = startBlackjackWithCards(1000, [c(8), c(8), c(10), c(7), c(3), c(2), c(10)]);
    const { extraBet, state } = split(s);
    expect(extraBet).toBe(1000);
    expect(state.playerHands.length).toBe(2);
    expect(state.playerHands[0]!.cards.length).toBe(2);
  });

  it("insurance pays 2:1 when dealer has blackjack", () => {
    const s = startBlackjackWithCards(1000, [c(10), c(9), c(1), c(10)]);
    expect(s.phase).toBe("insurance");
    const d = takeInsurance(s, true);
    expect(d.phase).toBe("settled");
    expect(d.payoutCents).toBe(1500); // 500 premium * 3
  });

  it("abandon settles open hand without payout", () => {
    const s = startBlackjackWithCards(1000, [c(10), c(9), c(1), c(8)]);
    expect(s.phase).toBe("insurance");
    const d = abandonHand(s);
    expect(d.phase).toBe("settled");
    expect(d.result).toBe("hand closed");
    expect(d.payoutCents).toBe(0);
  });
});
