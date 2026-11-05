import { describe, it, expect } from "vitest";
import { friendlyError } from "@/lib/friendlyError";

describe("round 20 first-timer copy", () => {
  it("out-of-chips points at the one-tap Add chips bar, not a trip to the Cage", () => {
    const m = friendlyError("insufficient funds");
    expect(m).toMatch(/Add chips/);
    expect(m).not.toMatch(/Cage/);
  });
});
