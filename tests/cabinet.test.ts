import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  autoNext, autoStopText, bellyPays, CAB_AUTO_SPINS, CAB_COIN_STEPS, ledText, leverFires, leverTravel, LEVER_FIRE_AT, paylineTabs, stepCoin,
} from "@/lib/cabinet";
import { PAYLINES, PAYTABLE } from "@/lib/games/slot";
import { VS_PAYLINES } from "@/lib/games/slotProgressive";
import { SLOT_COIN_MAX, SLOT_COIN_MIN } from "@/lib/quickBet";

describe("cabinet: Bet −/+", () => {
  it("walks the ladder one rung at a time and clamps to the published range", () => {
    expect(stepCoin(100, 1)).toBe(250);
    expect(stepCoin(100, -1)).toBe(50);
    expect(stepCoin(SLOT_COIN_MIN, -1)).toBe(SLOT_COIN_MIN);
    expect(stepCoin(SLOT_COIN_MAX, 1)).toBe(SLOT_COIN_MAX);
    expect(CAB_COIN_STEPS[0]).toBe(SLOT_COIN_MIN);
    expect(CAB_COIN_STEPS[CAB_COIN_STEPS.length - 1]).toBe(SLOT_COIN_MAX);
  });
  it("a custom coin between rungs moves to the neighbour in that direction", () => {
    expect(stepCoin(120, 1)).toBe(250);
    expect(stepCoin(120, -1)).toBe(100);
    expect(stepCoin(99999, -1)).toBe(2500);
  });
});

describe("cabinet: Auto", () => {
  const base = { remaining: 5, balanceCents: 10_000, costCents: 900, error: false, jackpot: false, cancelled: false };
  it("is a short fixed run", () => expect(CAB_AUTO_SPINS).toBe(10));
  it("continues only when nothing is in doubt", () => {
    expect(autoNext(base)).toEqual({ go: true });
    expect(autoNext({ ...base, remaining: 0 })).toEqual({ go: false, reason: "done" });
    expect(autoNext({ ...base, balanceCents: 899 })).toEqual({ go: false, reason: "funds" });
    expect(autoNext({ ...base, error: true })).toEqual({ go: false, reason: "error" });
    expect(autoNext({ ...base, jackpot: true })).toEqual({ go: false, reason: "jackpot" });
    expect(autoNext({ ...base, cancelled: true })).toEqual({ go: false, reason: "cancelled" });
    expect(autoNext({ ...base, realityDue: true })).toEqual({ go: false, reason: "reality" });
  });
  it("cancel and refusals win over everything else", () => {
    expect(autoNext({ ...base, cancelled: true, error: true, jackpot: true })).toEqual({ go: false, reason: "cancelled" });
    expect(autoNext({ ...base, error: true, remaining: 0 })).toEqual({ go: false, reason: "error" });
  });
  it("explains every stop in plain words", () => {
    for (const r of ["done", "funds", "error", "jackpot", "cancelled", "reality"] as const) expect(autoStopText(r)).toMatch(/Auto/);
  });
});

describe("cabinet: pull handle", () => {
  it("travel is a clamped fraction", () => {
    expect(leverTravel(50, 100)).toBe(0.5);
    expect(leverTravel(-20, 100)).toBe(0);
    expect(leverTravel(500, 100)).toBe(1);
    expect(leverTravel(10, 0)).toBe(0);
  });
  it("a tap pulls; a drag must pass the fire point; a short drag springs back", () => {
    expect(leverFires(2, 100, 2)).toBe(true);
    expect(leverFires(30, 100, 30)).toBe(false);
    expect(leverFires(LEVER_FIRE_AT * 100, 100, LEVER_FIRE_AT * 100)).toBe(true);
    expect(leverFires(-40, 100, -40)).toBe(false);
  });
});

describe("cabinet: meters, belly glass, payline tabs", () => {
  it("LED text is exact cents with grouping", () => {
    expect(ledText(0)).toBe("0.00");
    expect(ledText(905)).toBe("9.05");
    expect(ledText(12345678)).toBe("123,456.78");
    expect(ledText(-5)).toBe("0.00");
  });
  it("belly pays come straight from the paytable (5 of a kind), highest first", () => {
    const top = bellyPays(PAYTABLE as Record<string, readonly number[]>);
    expect(top).toHaveLength(3);
    for (const t of top) expect(t.pay5).toBe((PAYTABLE as Record<string, number[]>)[t.sym]![2]);
    expect(top[0]!.pay5).toBe(Math.max(...Object.values(PAYTABLE).map((v) => v[2])));
    expect(bellyPays(null)).toEqual([]);
  });
  it("tabs list every line exactly once per side, on the row it starts/ends", () => {
    for (const lines of [PAYLINES, VS_PAYLINES]) {
      for (const side of ["left", "right"] as const) {
        const rows = paylineTabs(lines, side);
        expect(rows.flat().sort((a, b) => a - b)).toEqual(lines.map((_, i) => i + 1));
        rows.forEach((nums, row) => nums.forEach((n) => expect(lines[n - 1]![side === "left" ? 0 : 4]).toBe(row)));
      }
    }
  });
});

describe("cabinet: wiring", () => {
  const chrome = readFileSync("src/components/SlotCabinet.tsx", "utf8");
  const css = readFileSync("src/app/cabinet.css", "utf8");
  const pages = ["src/app/slot/page.tsx", "src/app/vault/page.tsx"].map((f) => readFileSync(f, "utf8"));
  it("both slots render the full cabinet: topper, belly, deck and handle", () => {
    for (const src of pages) {
      for (const part of ["<CabinetTopper", "<CabinetBelly", "<CabinetDeck", "<CabinetLever", "useAutoSpin("]) expect(src).toContain(part);
      // handle and Auto go through the same server-validated go() path
      expect(src).toMatch(/<CabinetLever onPull=\{\(\) => void go\(\)\}/);
      expect(src).toMatch(/spinOnce: \(\) => void go\(\)/);
      // a refused spin stops Auto
      expect(src).toContain("auto.fail()");
      expect(src).toContain("Sandbox / test chips");
    }
    expect(pages[1]).toMatch(/<CabinetTopper title="Canopy Spire"[\s\S]{0,200}?<ProgressiveMeterStrip/);
  });
  it("win lighting is only applied after the reels settle", () => {
    expect(chrome).toContain("const after = settled && !spinning;");
    expect(chrome).toContain("const g = after ? glow : 0;");
    expect(chrome).toMatch(/const lit = new Set\(after \?/);
  });
  it("reduced motion: no chase, flashes or handle travel", () => {
    const rm = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(rm).toMatch(/\.cab-bulb[^}]*animation: none/);
    expect(rm).toMatch(/\.cab-lever-arm[^}]*transition: none/);
    // every animation in the file sits inside a no-preference guard
    const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, "");
    expect(outside).not.toMatch(/animation:\s*cab/);
  });
  it("no near-miss or anticipation styling while spinning", () => {
    expect(css).not.toMatch(/is-spinning[^{]*\{[^}]*animation/);
    for (const src of [chrome, ...pages]) expect(src).not.toMatch(/near.?miss|almost|so close/i);
  });
});
