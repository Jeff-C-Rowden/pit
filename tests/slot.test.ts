import { describe, it, expect } from "vitest";
import { exactRtp, evaluateGrid, PAYLINES, REELS, LINE_COUNT } from "../src/lib/games/slot";
import type { Symbol } from "../src/lib/games/slot";

describe("gilded track slot", () => {
  it("is 5 reels of 20 with 9 lines", () => {
    expect(REELS).toHaveLength(5);
    expect(REELS.every((r) => r.length === 20)).toBe(true);
    expect(PAYLINES).toHaveLength(9);
    expect(LINE_COUNT).toBe(9);
  });

  it("pays 5 crowns on the top line", () => {
    const grid: Symbol[][] = [
      ["CROWN","BAR","BAR"],
      ["CROWN","BAR","BAR"],
      ["CROWN","BAR","BAR"],
      ["CROWN","BAR","BAR"],
      ["CROWN","BAR","BAR"],
    ];
    const ev = evaluateGrid(grid, 1);
    const line0 = ev.lines.find((l) => l.line === 1); // top row is payline index 1
    expect(line0?.pay).toBe(600);
  });

  it("theoretical RTP is between 94% and 96%", () => {
    const rtp = exactRtp();
    expect(rtp).toBeGreaterThanOrEqual(0.94);
    expect(rtp).toBeLessThanOrEqual(0.96);
  }, 60_000);
});
