/**
 * Win lines are presentation only. Every show must come from a win the server paid, highlight
 * exactly the cells that formed it, and add up to what the spin paid. No spin that paid nothing
 * may draw anything (no fake or near-miss highlighting).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { PAYLINES, REELS, evaluateGrid, type Symbol } from "../src/lib/games/slot";
import { VS_PAYLINES, VS_REELS, evaluateVsGrid, type VsSymbol } from "../src/lib/games/slotProgressive";
import { MINE_PAYLINES, playMine, evaluateMineLine } from "../src/lib/games/mine";
import { CL_PAYLINES, playClover, evaluateClLine, expandWilds } from "../src/lib/games/clover";
import { playPrairie, evaluateWays, PR_PAY_SYMBOLS } from "../src/lib/games/prairie";
import { spinBuckshot, evaluateBuckshot, BB_BOUNTY_TABLE } from "../src/lib/games/buckshot";
import { classicShow, freeSpinShows, lineShows, scatterShow, showIndexAt, showMoney, showText, waysShows, type WinShow } from "../src/lib/winShow";

function lcg(seed: number) {
  let s = seed >>> 0;
  return (n: number) => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return Math.floor((s / 2 ** 32) * n); };
}
const sum = (xs: WinShow[]) => xs.reduce((a, s) => a + s.winCents, 0);
const win5 = (reels: readonly (readonly string[])[], pick: (n: number) => number) =>
  reels.map((strip) => { const st = pick(strip.length); return [0, 1, 2].map((r) => strip[(st + r) % strip.length]!); });

describe("payline shows (Sundown Trail, Antler Ridge)", () => {
  it("one show per paid line, cells are the first `count` payline cells, totals match, losers draw nothing", () => {
    const pick = lcg(7);
    let multi = 0;
    for (let i = 0; i < 4000; i++) {
      for (const [reels, lines, ev] of [
        [REELS, PAYLINES, (g: any) => { const e = evaluateGrid(g as Symbol[][], 25); return { lines: e.lines.filter((l) => l.winCents > 0), total: e.winCents }; }],
        [VS_REELS, VS_PAYLINES, (g: any) => { const e = evaluateVsGrid(g as VsSymbol[][], 25); return { lines: e.lines.filter((l) => l.winCents > 0), total: e.lineWinCents }; }],
      ] as const) {
        const grid = win5(reels, pick);
        const { lines: paid, total } = ev(grid);
        const shows = lineShows(paid, lines);
        expect(shows.length).toBe(paid.length);
        expect(sum(shows)).toBe(total);
        if (shows.length > 1) multi++;
        for (const s of shows) {
          const w = paid.find((l) => `l${l.line}` === s.key)!;
          expect(s.kind).toBe("line");
          expect(s.cells).toEqual(lines[w.line]!.slice(0, w.count).map((row, reel) => ({ reel, row })));
          expect(s.segments.length).toBe(4); // drawn across all five reels
          expect(s.label).toBe(`Line ${w.line + 1}`);
        }
      }
    }
    expect(multi).toBeGreaterThan(0);
  });

  it("formats 'Line 3 · $1.25'", () => {
    const [s] = lineShows([{ line: 2, count: 3, winCents: 125 }], PAYLINES);
    expect(showText(s!)).toBe("Line 3 · $1.25");
    expect(showMoney(123456)).toBe("$1,234.56");
    expect(lineShows([{ line: 2, count: 3, winCents: 0 }], PAYLINES)).toEqual([]);
  });
});

describe("Canary Creek Mine and Kettle of Clover", () => {
  it("base: lines + DYNAMITE scatter add up to the base win; free spins add up to each spin's pay", () => {
    const pick = lcg(11);
    let scat = 0, fsChecked = 0;
    for (let i = 0; i < 3000; i++) {
      const s = playMine(25, pick);
      const shows = [...lineShows(s.base.lineWins, MINE_PAYLINES), ...scatterShow(s.base.grid, "DYNAMITE", s.base.scatterWinCents, "DYNAMITE scatter")];
      expect(sum(shows)).toBe(s.baseWinCents);
      if (s.baseWinCents === 0) expect(shows).toEqual([]);
      for (const sh of shows) {
        if (sh.kind === "scatter") {
          scat++;
          expect(sh.segments).toEqual([]);
          expect(sh.cells.length).toBe(s.base.scatters);
          sh.cells.forEach((c) => expect(s.base.grid[c.reel]![c.row]).toBe("DYNAMITE"));
        } else {
          const w = s.base.lineWins.find((l) => `l${l.line}` === sh.key)!;
          const cells = MINE_PAYLINES[w.line]!.map((row, r) => s.base.grid[r]![row]!);
          expect(evaluateMineLine(cells)).toMatchObject({ symbol: w.symbol, count: sh.cells.length });
        }
      }
      for (const f of s.freeSpins?.spins ?? []) {
        const fsShows = freeSpinShows(f.grid, f.lineWins, MINE_PAYLINES, "DYNAMITE", "DYNAMITE scatter", f.winCents, f.mult);
        expect(sum(fsShows)).toBe(f.winCents);
        if (f.winCents === 0) expect(fsShows).toEqual([]);
        fsChecked++;
      }
    }
    expect(scat).toBeGreaterThan(0);
    expect(fsChecked).toBeGreaterThan(0);
  });

  it("clover: highlighted line cells re-evaluate to the paid symbol and count (free spins on the expanded view)", () => {
    const pick = lcg(23);
    let fsChecked = 0;
    for (let i = 0; i < 3000; i++) {
      const s = playClover(25, pick);
      const shows = [...lineShows(s.base.lineWins, CL_PAYLINES), ...scatterShow(s.base.grid, "KETTLE", s.base.scatterWinCents, "KETTLE scatter")];
      expect(sum(shows)).toBe(s.baseWinCents);
      for (const sh of shows.filter((x) => x.kind === "line")) {
        const w = s.base.lineWins.find((l) => `l${l.line}` === sh.key)!;
        const cells = CL_PAYLINES[w.line]!.map((row, r) => s.base.grid[r]![row]!);
        expect(evaluateClLine(cells)).toMatchObject({ symbol: w.symbol, count: sh.cells.length });
      }
      for (const fs of [s.freeSpins, s.wheel?.freeSpins].filter(Boolean)) {
        for (const f of fs!.spins) {
          expect(f.shown).toEqual(expandWilds(f.grid));
          expect(sum(freeSpinShows(f.grid, f.lineWins, CL_PAYLINES, "KETTLE", "KETTLE scatter", f.winCents, 1))).toBe(f.winCents);
          fsChecked++;
        }
      }
    }
    expect(fsChecked).toBeGreaterThan(0);
  });
});

describe("Thunderhoof Prairie (243 ways)", () => {
  it("each paid symbol gets one show; highlighted cells per reel multiply to the paid way count", () => {
    const pick = lcg(5);
    const W = ["WILD", "W2", "W3"];
    let multiWay = 0;
    for (let i = 0; i < 3000; i++) {
      const s = playPrairie(25, pick);
      const shows = waysShows(s.base.grid, s.base.wins, W);
      expect(shows.length).toBe(s.base.wins.length);
      expect(sum(shows)).toBe(s.base.waysWinCents);
      for (const sh of shows) {
        const w = s.base.wins.find((x) => `w${x.symbol}` === sh.key)!;
        const per = Array.from({ length: w.reels }, (_, r) => sh.cells.filter((c) => c.reel === r).length);
        expect(per.reduce((a, b) => a * b, 1)).toBe(w.ways);
        expect(sh.cells.every((c) => c.reel < w.reels)).toBe(true);
        // joined reel to reel: every adjacent pair of highlighted cells is a segment
        const exp = per.slice(1).reduce((a, n, r) => a + per[r]! * n, 0);
        expect(sh.segments.length).toBe(exp);
        if (w.ways > 1) multiWay++;
      }
      // the evaluator agrees nothing else paid
      expect(evaluateWays(s.base.grid, 25).wins.map((x) => x.symbol)).toEqual(s.base.wins.map((x) => x.symbol));
    }
    expect(multiWay).toBeGreaterThan(0);
    expect(PR_PAY_SYMBOLS.length).toBe(8);
  });
});

describe("Buckshot / Bounty Bars (3 reels, 1 payline)", () => {
  it("payline across all three reels; cherry pays highlight only cherries and wilds; losers draw nothing", () => {
    const pick = lcg(3);
    for (let i = 0; i < 4000; i++) {
      for (const t of [undefined, BB_BOUNTY_TABLE]) {
        const s = spinBuckshot(1, 100, pick, t);
        const shows = classicShow(s.line, s.kind, s.winCents);
        if (s.winCents === 0) { expect(shows).toEqual([]); continue; }
        expect(shows).toHaveLength(1);
        const sh = shows[0]!;
        expect(sh.winCents).toBe(s.winCents);
        expect(sh.segments).toHaveLength(2);
        expect(sh.cells.every((c) => c.row === 1)).toBe(true);
        if (/CHERR/.test(s.kind)) {
          expect(sh.cells.every((c) => s.line[c.reel] === "CHERRY" || s.line[c.reel] === "WILD")).toBe(true);
          expect(evaluateBuckshot(s.line, 1, t).pay * 100).toBe(s.winCents);
        } else expect(sh.cells).toHaveLength(3);
      }
    }
  });
});

describe("cycling + presentation guards", () => {
  it("cycles through every win in order and a single win stays put", () => {
    expect(showIndexAt(0, 999)).toBe(-1);
    expect(showIndexAt(1, 99999)).toBe(0);
    expect([0, 1600, 3200, 4800].map((t) => showIndexAt(3, t))).toEqual([0, 1, 2, 0]);
  });

  it("the overlay starts only after the reels settle and never feeds back into the game", () => {
    const src = readFileSync("src/components/WinLineOverlay.tsx", "utf8");
    expect(src).not.toMatch(/api\(|fetch\(/);
    const cab = readFileSync("src/components/SlotCabinet.tsx", "utf8");
    expect(cab).toMatch(/<WinLineOverlay shows=\{winShows \?\? \[\]\} active=\{after\} \/>/);
    expect(cab).toMatch(/const after = settled && !spinning;/);
    const lib = readFileSync("src/lib/winShow.ts", "utf8");
    expect(lib).not.toMatch(/from "\.\/(rng|ledger|db)"/);
    const css = readFileSync("src/app/winlines.css", "utf8");
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
  });

  it("all seven cabinets pass server wins to the overlay", () => {
    const want: [string, RegExp][] = [
      ["src/app/slot/page.tsx", /lineShows\(spin\?\.lineWins[^)]*, PAYLINES\)/],
      ["src/app/vault/page.tsx", /lineShows\(spin\?\.lineWins[^)]*, VS_PAYLINES\)/],
      ["src/components/BuckshotGame.tsx", /classicShow\(spin\?\.line, spin\?\.kind/],
      ["src/app/mine/page.tsx", /scatterShow\(spin\.grid, "DYNAMITE"/],
      ["src/app/prairie/page.tsx", /waysShows\(grid, wins, WILDS/],
      ["src/app/clover/page.tsx", /scatterShow\(spin\.grid, "KETTLE"/],
    ];
    for (const [f, re] of want) {
      const s = readFileSync(f, "utf8");
      expect(s, f).toMatch(re);
      expect(s, f).toMatch(/winShows=\{/);
    }
  });
});
