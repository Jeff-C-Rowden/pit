import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HOARD_ART, JADE_ART } from "@/components/DragonSymbols";
import { PAYTABLE, SYMBOLS } from "@/lib/games/slot";
import { VS_PAYTABLE, VS_SYMBOLS } from "@/lib/games/slotProgressive";

describe("dragon reel symbols are art only", () => {
  it("cover exactly the existing symbol keys", () => {
    expect(Object.keys(HOARD_ART).sort()).toEqual([...SYMBOLS].sort());
    expect(Object.keys(JADE_ART).sort()).toEqual([...VS_SYMBOLS].sort());
  });
  it("leave the paytables untouched", () => {
    expect(PAYTABLE).toEqual({ WILD: [60, 240, 1200], CROWN: [30, 120, 600], DIAMOND: [24, 96, 300], ACE: [18, 60, 180], CHIP: [12, 30, 96], HORSE: [10, 24, 60], LAMP: [6, 18, 48], BAR: [6, 12, 30] });
    expect(VS_PAYTABLE).toEqual({ WILD: [50, 200, 800], MONKEY: [40, 160, 500], PARROT: [28, 100, 400], JAGUAR: [20, 80, 240], TOUCAN: [14, 48, 140], BANANA: [10, 28, 80], COCONUT: [8, 20, 48], VINE: [5, 12, 28] });
  });
  it("render original inline SVG with unique labels, wild still says WILD", () => {
    for (const set of [HOARD_ART, JADE_ART]) {
      const arts = Object.values(set);
      expect(new Set(arts.map((a) => a.label)).size).toBe(arts.length);
      expect(set.WILD.label).toBe("WILD");
      for (const a of arts) {
        const h = renderToStaticMarkup(createElement(a.Svg));
        expect(h).toContain("<svg");
        expect(h).not.toMatch(/<image|href=|https?:/);
      }
    }
  });
});
