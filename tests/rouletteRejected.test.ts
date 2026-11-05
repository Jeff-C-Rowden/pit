import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

// Freeze report (Nov 5): refused spins (400: insufficient funds / limits) looked like a dead Spin
// button because the reason rendered above the wheel and Spin had already scrolled it under the
// top bar. Browser check: tests/e2e/roulette-rejected-spin.mjs.
describe("roulette refused spin stays explained", () => {
  const src = readFileSync("src/app/roulette/page.tsx", "utf8");
  it("shows the error inside the bottom dock next to Spin", () => {
    const dock = src.indexOf('className={`rl-dock');
    expect(dock).toBeGreaterThan(-1);
    const errAt = src.indexOf('rl-dock-err');
    expect(errAt).toBeGreaterThan(dock);
    expect(src.slice(0, dock).includes('role="alert"')).toBe(false);
  });
  it("only scrolls to the wheel after the server accepted the spin", () => {
    const go = src.slice(src.indexOf("async function go()"));
    const post = go.indexOf('api("/api/games/roulette"');
    const scroll = go.indexOf("wheelRef.current?.scrollIntoView");
    expect(post).toBeGreaterThan(-1);
    expect(scroll).toBeGreaterThan(post);
  });
});
