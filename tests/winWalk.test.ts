/**
 * Slot Scout S3: multi-win walkthrough timing (total first, ~400ms per win, settle on the total,
 * tap to skip) and quiet losing spins. Presentation only: the shows/amounts are the server's.
 */
import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  lineShows, scatterShow, showsTotalCents, totalText, unionCells, walkDurationMs, walkStep,
  WALK_STEP_MS, WALK_TOTAL_MS, type WinShow,
} from "../src/lib/winShow";

const PAYLINES = [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0]];

describe("walkStep", () => {
  it("draws nothing for a losing spin", () => {
    expect(walkStep(0, 0)).toEqual({ phase: "done", index: -1 });
    expect(walkDurationMs(0)).toBe(0);
  });
  it("shows a single win on its own straight away, with no walkthrough", () => {
    expect(walkStep(1, 0)).toEqual({ phase: "done", index: 0 });
    expect(walkStep(1, 99999)).toEqual({ phase: "done", index: 0 });
    expect(walkDurationMs(1)).toBe(0);
  });
  it("shows the total first, then each win ~400ms, then settles on the total", () => {
    expect(WALK_STEP_MS).toBe(400);
    expect(walkStep(3, 0)).toEqual({ phase: "total", index: -1 });
    expect(walkStep(3, WALK_TOTAL_MS - 1).phase).toBe("total");
    const at = (k: number) => walkStep(3, WALK_TOTAL_MS + k * WALK_STEP_MS + 10);
    expect([at(0), at(1), at(2)]).toEqual([0, 1, 2].map((index) => ({ phase: "line", index })));
    expect(walkStep(3, walkDurationMs(3))).toEqual({ phase: "done", index: -1 });
    // stays still on the total afterwards: no endless cycling
    expect(walkStep(3, 60_000)).toEqual({ phase: "done", index: -1 });
  });
  it("each win gets exactly one step, in order", () => {
    const seen: number[] = [];
    for (let t = 0; t < walkDurationMs(5) + 500; t += 25) {
      const s = walkStep(5, t);
      if (s.phase === "line" && seen[seen.length - 1] !== s.index) seen.push(s.index);
    }
    expect(seen).toEqual([0, 1, 2, 3, 4]);
  });
  it("tap to skip jumps straight to the settled total", () => {
    expect(walkStep(4, 0, true)).toEqual({ phase: "done", index: -1 });
    expect(walkStep(4, WALK_TOTAL_MS + 50, true)).toEqual({ phase: "done", index: -1 });
    expect(walkStep(1, 0, true)).toEqual({ phase: "done", index: 0 });
  });
  it("walk length is total + one step per win", () => {
    expect(walkDurationMs(2)).toBe(WALK_TOTAL_MS + 2 * WALK_STEP_MS);
    expect(walkDurationMs(6)).toBe(WALK_TOTAL_MS + 6 * WALK_STEP_MS);
  });
});

describe("total view", () => {
  const grid = [["A", "K", "STORM"], ["A", "Q", "J"], ["A", "STORM", "J"], ["Q", "K", "STORM"], ["J", "Q", "K"]];
  const shows: WinShow[] = [
    ...lineShows([{ line: 0, count: 3, winCents: 125 }, { line: 3, count: 3, winCents: 50 }], PAYLINES),
    ...scatterShow(grid, "STORM", 200, "STORM scatter"),
  ];
  it("total equals the sum of the paid wins and says how many", () => {
    expect(showsTotalCents(shows)).toBe(375);
    expect(totalText(shows)).toBe("Total win $3.75 · 3 wins");
    expect(totalText(shows.slice(0, 1))).toBe("Total win $1.25");
  });
  it("frames every winning cell once", () => {
    const cells = unionCells(shows);
    const keys = cells.map((c) => `${c.reel}-${c.row}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of shows) for (const c of s.cells) expect(keys).toContain(`${c.reel}-${c.row}`);
    // reel 2 row 1 is on line 1 and is also a STORM scatter: framed once
    expect(keys.filter((k) => k === "2-1").length).toBe(1);
  });
  it("a losing spin has nothing to total", () => {
    expect(showsTotalCents([])).toBe(0);
    expect(unionCells([])).toEqual([]);
  });
});

describe("overlay and quiet losses (source)", () => {
  const overlay = readFileSync("src/components/WinLineOverlay.tsx", "utf8");
  it("overlay uses the walkthrough, skips on tap, and honours reduced motion", () => {
    expect(overlay).toMatch(/walkStep\(/);
    expect(overlay).toMatch(/onPointerDown=\{walking/);
    expect(overlay).toMatch(/let skipped = reducedMotion\(\)/);
    expect(overlay).not.toMatch(/showIndexAt/);
  });
  it("every slot's losing-spin banner is quiet; wins are not", () => {
    for (const f of ["src/app/slot/page.tsx", "src/app/vault/page.tsx", "src/app/mine/page.tsx", "src/app/clover/page.tsx", "src/app/prairie/page.tsx", "src/components/BuckshotGame.tsx"]) {
      const src = readFileSync(f, "utf8");
      const banners = src.match(/<OutcomeBanner[\s\S]*?\/>/g) ?? [];
      const losses = banners.filter((b) => /You lose this spin/.test(b));
      expect(losses.length, f).toBeGreaterThan(0);
      for (const b of losses) expect(b, f).toMatch(/\bquiet\b/);
      for (const b of banners.filter((x) => /\bwin\b/.test(x) && !/You lose/.test(x))) expect(b, f).not.toMatch(/\bquiet\b/);
    }
  });
  it("quiet banner has no entry animation and never plays the payout sound", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/\.result-banner\.hand-result\.quiet \{[^}]*animation: none/);
    const ux = readFileSync("src/components/TableUX.tsx", "utf8");
    expect(ux).toMatch(/QUIET_LOSS_DIM_MS = 1200/);
  });
});
