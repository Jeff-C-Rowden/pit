import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { shouldSwallowClick } from "../src/lib/tapGuard";

describe("roulette touch taps", () => {
  it("never swallows a normal tap", () => {
    expect(shouldSwallowClick(false, 0, 10_000)).toBe(false);
  });
  it("swallows only the click right after a long-press", () => {
    expect(shouldSwallowClick(true, 10_000, 10_300)).toBe(true);
    expect(shouldSwallowClick(true, 10_000, 15_000)).toBe(false);
  });
  it("result card is an overlay on the wheel, not inside the bottom dock (it covered table cells after a spin)", () => {
    const src = readFileSync("src/app/roulette/page.tsx", "utf8");
    const dockStart = src.indexOf('className={`rl-dock');
    expect(dockStart).toBeGreaterThan(-1);
    expect(src.slice(dockStart).includes("rl-result")).toBe(false);
    expect(src).toContain("rl-result-ov");
  });
});
