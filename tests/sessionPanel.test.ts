import { describe, it, expect } from "vitest";
import { countBets, netFromRows, nudgeBlock, nudgeDue, fmtMinutes } from "../src/lib/sessionStrip";

const rows = [
  { type: "payout", amountCents: 500 }, { type: "bet", amountCents: -100 },
  { type: "bet", amountCents: -200 }, { type: "refund", amountCents: 200 }, { type: "deposit", amountCents: 9999 },
];
describe("session strip", () => {
  it("counts only real bets", () => expect(countBets(rows)).toBe(2));
  it("net is payouts+refunds minus bets, ignores other ledger types", () => expect(netFromRows(rows)).toBe(400));
  it("empty is zero", () => { expect(countBets([])).toBe(0); expect(netFromRows([])).toBe(0); });
  it("blocks at 30 min steps", () => { expect(nudgeBlock(29)).toBe(0); expect(nudgeBlock(30)).toBe(1); expect(nudgeBlock(65)).toBe(2); });
  it("nudge shows once per block and stays dismissed", () => {
    expect(nudgeDue(29, 0)).toBe(false);
    expect(nudgeDue(30, 0)).toBe(true);
    expect(nudgeDue(45, 1)).toBe(false);
    expect(nudgeDue(60, 1)).toBe(true);
  });
  it("formats time", () => { expect(fmtMinutes(12)).toBe("12 min"); expect(fmtMinutes(95)).toBe("1 hr 35 min"); });
});
