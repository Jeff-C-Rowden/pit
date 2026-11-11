import { describe, it, expect } from "vitest";
import { evalFive, evalTwo, cmpHands, houseWay, startPaiGow, setHouseWayPlayer, setHands } from "../src/lib/games/paigow";
import type { Card } from "../src/lib/games/cards";

const C = (rank: Card["rank"], suit: Card["suit"], joker = false): Card => ({ rank, suit, joker });

describe("pai gow", () => {
  it("five-card must outrank two-card in house way", () => {
    const cards = [C(13,"s"), C(12,"h"), C(11,"d"), C(10,"c"), C(2,"s"), C(3,"h"), C(4,"d")];
    const hw = houseWay(cards);
    expect(cmpHands(evalFive(hw.high), evalTwo(hw.low))).toBeGreaterThanOrEqual(0);
  });

  it("joker makes five aces", () => {
    const five = evalFive([C(1,"s"), C(1,"h"), C(1,"d"), C(1,"c"), C(1,"s", true)]);
    expect(five.name).toMatch(/five aces|four of a kind/);
  });

  it("start + house way settles with commission on a win or push/lose otherwise", () => {
    const s = startPaiGow(1000);
    const done = setHouseWayPlayer(s);
    expect(done.phase).toBe("settled");
    expect(["set","settled"]).toContain(done.phase);
    if (done.result?.startsWith("win both")) {
      expect(done.commissionCents).toBe(50);
      expect(done.payoutCents).toBe(2000 - 50);
    } else if (done.result?.startsWith("push")) {
      expect(done.payoutCents).toBe(1000);
    } else {
      expect(done.payoutCents).toBe(0);
    }
  });

  it("sets a legal house way without fouling", () => {
    const s = startPaiGow(1000);
    const d = setHouseWayPlayer(s);
    expect(d.phase).toBe("settled");
    expect(d.playerHigh).toHaveLength(5);
    expect(d.playerLow).toHaveLength(2);
    expect(cmpHands(evalFive(d.playerHigh!), evalTwo(d.playerLow!))).toBeGreaterThanOrEqual(0);
    void setHands;
  });
});

describe("joker is ace or straight/flush filler only", () => {
  it("does not turn a pair of kings into three kings", () => {
    const hand = evalFive([C(13, "s"), C(13, "h"), C(12, "d"), C(9, "c"), C(1, "s", true)]);
    expect(hand.name).toBe("pair");
    expect(hand.kick[0]).toBe(13);
  });
  it("still makes five aces with four aces", () => {
    const five = evalFive([C(1, "s"), C(1, "h"), C(1, "d"), C(1, "c"), C(1, "s", true)]);
    expect(five.name).toBe("five aces");
  });
  it("completes a straight and a flush", () => {
    const st = evalFive([C(2, "s"), C(3, "h"), C(4, "d"), C(5, "c"), C(1, "s", true)]);
    expect(st.name).toBe("straight");
    const fl = evalFive([C(13, "h"), C(11, "h"), C(8, "h"), C(3, "h"), C(1, "s", true)]);
    expect(fl.name).toBe("flush");
  });
});
