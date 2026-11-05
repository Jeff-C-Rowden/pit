import { describe, it, expect } from "vitest";
import { friendlyError } from "../src/lib/friendlyError";

describe("friendlyError", () => {
  it("maps limit errors", () => {
    expect(friendlyError("deposit limit must be integer cents >= $10")).toBe("Deposit limit must be at least $10. Clear the box for no limit.");
    expect(friendlyError("loss limit must be integer cents >= $10")).toMatch(/^Loss limit must be at least \$10/);
  });
  it("formats cents in raise errors", () => {
    expect(friendlyError("minimum raise is to 400")).toBe("The smallest raise is to $4.00.");
  });
  it("maps funds and craps timing", () => {
    expect(friendlyError("insufficient funds")).toMatch(/Not enough chips/);
    expect(friendlyError("pass line only on come-out")).toMatch(/before the point/);
    expect(friendlyError("come odds gone")).toMatch(/^Come odds need/);
    expect(friendlyError("don't come odds only on numbered bet")).toMatch(/^Don't come odds need/);
  });
  it("never leaks cents wording", () => {
    for (const e of ["amount must be a positive integer (cents)", "deposit limit must be integer cents >= $10"]) expect(friendlyError(e)).not.toMatch(/cents/);
  });
  it("capitalises unknown messages and handles empty", () => {
    expect(friendlyError("finish this hand first")).toBe("Finish this hand first");
    expect(friendlyError("")).toBe("Something went wrong. Try again.");
  });
});
