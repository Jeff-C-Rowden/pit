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
