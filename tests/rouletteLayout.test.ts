import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Cloth from "../src/components/RouletteCloth";
import { FELT_ROWS } from "../src/lib/games/rouletteFelt";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("roulette page: old Session/Hottest panel removed, Recent numbers kept", () => {
  it("no RouletteStats component or Session/Hottest copy remains", () => {
    expect("RouletteStats" in Cloth).toBe(false);
    expect("tallySession" in Cloth).toBe(false);
    const src = read("src/components/RouletteCloth.tsx") + read("src/app/roulette/page.tsx");
    expect(src).not.toMatch(/Hottest|rl-stats|Session ·/);
    expect(read("src/app/globals.css")).not.toMatch(/\.rl-stats|\.rl-hot\b/);
  });
  it("collapsible Recent numbers panel (round 7) is still on the page", () => {
    const page = read("src/app/roulette/page.tsx");
    expect(page).toMatch(/<details className="rl-recent panel">/);
    expect(page).toMatch(/Recent numbers/);
    expect(page).toMatch(/Past results don't predict anything/);
  });
});

describe("roulette table fits its column (no sideways scroll)", () => {
  it("final CSS drops the fixed 560px grid min-width and uses shrinkable number columns", () => {
    const css = read("src/app/globals.css");
    const last560 = css.lastIndexOf("min-width: 560px");
    const fit = css.indexOf("Roulette round 10: the betting table always fits its column");
    expect(fit).toBeGreaterThan(last560);
    const block = css.slice(fit);
    expect(block).toMatch(/\.rl-cloth \{ overflow-x: visible; \}/);
    expect(block).toMatch(/\.rl-grid \{ min-width: 0; width: 100%;/);
    expect(block).toMatch(/repeat\(12, minmax\(0, 1fr\)\)/);
    // Phone stand-on-end layout covers every phone width up to 700px.
    expect(css).toMatch(/@media \(max-width: 700px\) \{\n  \.rl-cloth \{ overflow-x: visible; \}/);
    expect(css.slice(css.indexOf("/* Phone: stand the roulette layout on end"))).not.toMatch(/max-width: 600px/);
  });
});

describe("every bet spot is rendered and mapped to adjacent felt numbers", () => {
  const html = renderToStaticMarkup(createElement(Cloth.default, { onAdd: () => {}, onAmount: () => 0 }));
  const titles = [...html.matchAll(/title="([^"]+)"/g)].map((m) => m[1]!.replace(/&#x27;/g, "'"));
  const pos = new Map<number, [number, number]>();
  FELT_ROWS.forEach((row, r) => row.forEach((n, c) => pos.set(n, [r, c])));
  const nums = (t: string) => t.match(/(\d+(?:-\d+)+)/)![1]!.split("-").map(Number);

  it("has 57 splits, 22 corners, 12 streets, 11 six-lines", () => {
    expect(titles.filter((t) => t.startsWith("Split")).length).toBe(57);
    expect(titles.filter((t) => t.startsWith("Corner")).length).toBe(22);
    expect(titles.filter((t) => t.startsWith("Street")).length).toBe(12);
    expect(titles.filter((t) => t.startsWith("Six-line")).length).toBe(11);
  });
  it("splits touch, corners form a 2x2 square on the felt", () => {
    for (const t of titles.filter((x) => x.startsWith("Split"))) {
      const [a, b] = nums(t).map((n) => pos.get(n)!);
      expect(Math.abs(a![0] - b![0]) + Math.abs(a![1] - b![1]), t).toBe(1);
    }
    for (const t of titles.filter((x) => x.startsWith("Corner"))) {
      const ps = nums(t).map((n) => pos.get(n)!);
      const rows = new Set(ps.map((p) => p[0])), cols = new Set(ps.map((p) => p[1]));
      expect(rows.size === 2 && cols.size === 2 && Math.max(...cols) - Math.min(...cols) === 1 && Math.max(...rows) - Math.min(...rows) === 1, t).toBe(true);
    }
  });
});
