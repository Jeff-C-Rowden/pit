import { describe, it, expect } from "vitest";
import { previewBets } from "../src/lib/games/roulettePreview";
import { settleRoulette, WHEEL } from "../src/lib/games/roulette";

describe("roulette pre-spin preview", () => {
  it("empty table", () => {
    expect(previewBets([])).toMatchObject({ stakeCents: 0, bestReturnCents: 0, hitPockets: 0, netWinPockets: 0, pockets: 38 });
  });
  it("straight up on 17 pays 36x back on 1 of 38", () => {
    expect(previewBets([{ kind: "straight", numbers: ["17"], amountCents: 100 }])).toMatchObject({ bestReturnCents: 3600, hitPockets: 1, netWinPockets: 1 });
  });
  it("red: 18 of 38 hit, never covers 0/00", () => {
    expect(previewBets([{ kind: "red", amountCents: 500 }])).toMatchObject({ bestReturnCents: 1000, hitPockets: 18, netWinPockets: 18 });
  });
  it("hedged bets: hit count can exceed net-win count", () => {
    const p = previewBets([{ kind: "red", amountCents: 100 }, { kind: "black", amountCents: 100 }]);
    expect(p.hitPockets).toBe(36);
    expect(p.netWinPockets).toBe(0);
  });
  it("best return matches the server's settlement on every pocket", () => {
    const mixed = [
      { kind: "straight", numbers: ["1"], amountCents: 100 },
      { kind: "split", numbers: ["1", "2"], amountCents: 100 },
      { kind: "corner", numbers: ["1", "2", "4", "5"], amountCents: 100 },
      { kind: "dozen", which: 1, numbers: Array.from({ length: 12 }, (_, i) => String(i + 1)), amountCents: 100 },
      { kind: "red", numbers: ["1","3","5","7","9","12","14","16","18","19","21","23","25","27","30","32","34","36"], amountCents: 100 },
    ];
    const server = Math.max(...WHEEL.map((p) => settleRoulette(mixed as never, p).payoutCents));
    expect(previewBets(mixed).bestReturnCents).toBe(server);
  });
});
