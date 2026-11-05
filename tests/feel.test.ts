import { describe, it, expect } from "vitest";
import { celebrationLevel, shouldSlidePayout } from "../src/lib/feel";

describe("celebrationLevel", () => {
  it("never celebrates a loss, push or a win smaller than the stake", () => {
    expect(celebrationLevel(1000, 0)).toBe(0);
    expect(celebrationLevel(1000, 1000)).toBe(0);
    expect(celebrationLevel(1000, 1950)).toBe(0); // pai gow 0.95:1
    expect(celebrationLevel(1000, 1500)).toBe(0); // 1:2 profit
  });
  it("needs a known stake", () => {
    expect(celebrationLevel(undefined, 50000)).toBe(0);
    expect(celebrationLevel(0, 50000)).toBe(0);
  });
  it("scales with profit over stake", () => {
    expect(celebrationLevel(1000, 2000)).toBe(1); // even money
    expect(celebrationLevel(1000, 2500)).toBe(1); // 3:2
    expect(celebrationLevel(1000, 6000)).toBe(2); // 5:1
    expect(celebrationLevel(1000, 36000)).toBe(3); // 35:1
  });
});

describe("shouldSlidePayout", () => {
  it("slides only real wins", () => {
    expect(shouldSlidePayout("win", 1950)).toBe(true);
    expect(shouldSlidePayout("loss", 0)).toBe(false);
    expect(shouldSlidePayout("push", 1000)).toBe(false);
    expect(shouldSlidePayout("win", 0)).toBe(false);
  });
});
