import { describe, it, expect } from "vitest";
import { historyCsv } from "../src/lib/session";

const at = "2026-11-05T07:00:00.000Z";
describe("history CSV totals", () => {
  it("adds total bet, won, stake back and net rows that match the ledger rows", () => {
    const csv = historyCsv([
      { at, type: "payout", game: "blackjack", amountCents: 2500, balanceAfterCents: 0, stakeBackCents: 1000 },
      { at, type: "bet", game: "blackjack", amountCents: -1000, balanceAfterCents: 0 },
      { at, type: "bet", game: "roulette", amountCents: -500, balanceAfterCents: 0 },
      { at, type: "refund", game: "roulette", amountCents: 200, balanceAfterCents: 0 },
      { at, type: "deposit", game: null, amountCents: 5000, balanceAfterCents: 0 },
    ]).trim().split("\r\n");
    const tail = csv.slice(-4);
    expect(tail[0]).toContain('"TOTALS","","","total_bet","-15.00"');
    expect(tail[1]).toContain('"total_won","15.00"');
    expect(tail[2]).toContain('"total_stake_back","10.00"');
    expect(tail[3]).toContain('"net","12.00"'); // 25 + 2 refund - 15 bet; deposits are not winnings
    expect(csv).toHaveLength(1 + 5 + 4);
  });
  it("empty range still has zero totals", () => {
    const csv = historyCsv([]);
    expect(csv).toContain('"net","0.00"');
  });
});
