import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GameArt, { GAME_ART_KINDS } from "@/components/GameArt";

const render = (k: string) => renderToStaticMarkup(createElement(GameArt, { kind: k }));

describe("Floor game art", () => {
  it("renders decorative inline SVG for every lobby table", () => {
    for (const k of GAME_ART_KINDS) {
      const h = render(k);
      expect(h).toContain(`data-art="${k}"`);
      expect(h).toContain('aria-hidden="true"');
      expect(h).not.toMatch(/<image|href=|https?:/);
    }
  });
  it("is distinct per game", () => {
    const set = new Set(GAME_ART_KINDS.map(render));
    expect(set.size).toBe(GAME_ART_KINDS.length);
  });
  it("roulette shows a wheel, slots show reels", () => {
    expect(render("rl")).toContain("<circle");
    expect(render("slot")).toContain("7");
    expect(render("vault")).toContain("▲");
  });
  it("portrait lobby tiles reuse each table's art, no external images", () => {
    const tiles = GAME_ART_KINDS.map((k) => renderToStaticMarkup(createElement(GameArt, { kind: k, variant: "tile" })));
    for (const h of tiles) {
      expect(h).toContain('data-variant="tile"');
      expect(h).toContain('viewBox="0 0 240 300"');
      expect(h).not.toMatch(/<image|href=|https?:/);
    }
    expect(new Set(tiles).size).toBe(GAME_ART_KINDS.length);
  });
});
