import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  winTier, tierGlow, multipleText, returnedText, celebrationFor, sparkLayout, NO_CELEBRATION, TIER_SPARKS,
} from "../src/lib/winCelebration";
import { slotGlowTier } from "../src/lib/feel";

const read = (p: string) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

describe("#6 win tiers by win ÷ total bet", () => {
  it("never celebrates a loss, part back or bet back", () => {
    expect(winTier(90, 0)).toBe("none");
    expect(winTier(90, 45)).toBe("none");
    expect(winTier(90, 89)).toBe("none");
    expect(winTier(90, 90)).toBe("none"); // break-even is not a win
    expect(winTier(0, 5000)).toBe("none");
    expect(winTier(null, 5000)).toBe("none");
    expect(winTier(90, null)).toBe("none");
    expect(winTier(-90, 500)).toBe("none");
    expect(winTier(90, Number.NaN)).toBe("none");
  });
  it("tier thresholds at exact multiples (integer cents, no float drift)", () => {
    expect(winTier(90, 91)).toBe("small");
    expect(winTier(90, 179)).toBe("small");
    expect(winTier(90, 180)).toBe("nice"); // 2×
    expect(winTier(90, 539)).toBe("nice");
    expect(winTier(90, 540)).toBe("big"); // 6×
    expect(winTier(90, 1889)).toBe("big");
    expect(winTier(90, 1890)).toBe("huge"); // 21×
    expect(winTier(30, 60)).toBe("nice");
    expect(winTier(75, 450)).toBe("big");
    expect(winTier(225, 225 * 21)).toBe("huge");
  });
  it("glow follows the same tiers and slotGlowTier stays in sync", () => {
    expect(["none", "small", "nice", "big", "huge"].map((t) => tierGlow(t as never))).toEqual([0, 1, 2, 3, 4]);
    for (const bet of [25, 75, 90, 225, 900]) {
      for (let win = 0; win <= bet * 25; win += Math.max(1, Math.floor(bet / 7))) {
        expect(slotGlowTier(bet, win)).toBe(tierGlow(winTier(bet, win)));
      }
    }
  });
});

describe("#6 honest labels", () => {
  it("multiple is rounded down, never overstated", () => {
    expect(multipleText(90, 180)).toBe("2× bet");
    expect(multipleText(90, 179)).toBe("1.9× bet");
    expect(multipleText(30, 89)).toBe("2.9× bet");
    expect(multipleText(90, 1890)).toBe("21× bet");
    expect(multipleText(0, 100)).toBe("");
  });
  it("a pay at or below the bet reads as Returned, never as a win", () => {
    expect(returnedText(90, 45)).toBe("Returned $0.45");
    expect(returnedText(90, 90)).toBe("Returned $0.90");
    expect(returnedText(90, 91)).toBeNull();
    expect(returnedText(90, 0)).toBeNull();
  });
});

describe("#6 celebration plan", () => {
  const base = { betCents: 90, settled: true, reduced: false, feelOn: true, spinKey: "a" };
  it("nothing until the reels have settled", () => {
    expect(celebrationFor({ ...base, winCents: 5000, settled: false })).toBe(NO_CELEBRATION);
  });
  it("nothing at or below the bet", () => {
    for (const w of [0, 30, 89, 90]) expect(celebrationFor({ ...base, winCents: w })).toEqual(NO_CELEBRATION);
  });
  it("plate titles, amounts and sparks scale with the tier", () => {
    const small = celebrationFor({ ...base, winCents: 120 });
    expect(small.plate).toMatchObject({ title: "WIN", amount: "$1.20", multiple: "1.3× bet", sparks: 0, motion: true });
    expect(celebrationFor({ ...base, winCents: 270 }).plate).toMatchObject({ title: "NICE WIN", sparks: TIER_SPARKS.nice });
    expect(celebrationFor({ ...base, winCents: 900 }).plate).toMatchObject({ title: "BIG WIN", sparks: TIER_SPARKS.big, amount: "$9.00" });
    const huge = celebrationFor({ ...base, winCents: 250000 });
    expect(huge.plate).toMatchObject({ title: "HUGE WIN", amount: "$2,500.00", sparks: TIER_SPARKS.huge });
    expect(huge.glow).toBe(4);
    expect(huge.live).toBe(true);
    expect(TIER_SPARKS.small < TIER_SPARKS.nice && TIER_SPARKS.nice < TIER_SPARKS.big && TIER_SPARKS.big < TIER_SPARKS.huge).toBe(true);
  });
  it("prefers-reduced-motion: same honest plate, no sparks, no pop, no flashing lights", () => {
    const c = celebrationFor({ ...base, winCents: 250000, reduced: true });
    expect(c.plate).toMatchObject({ title: "HUGE WIN", sparks: 0, motion: false });
    expect(c.live).toBe(false);
    expect(c.glow).toBe(4);
  });
  it("lights only flash with Sound & feel on", () => {
    expect(celebrationFor({ ...base, winCents: 900, feelOn: false }).live).toBe(false);
  });
  it("feature / jackpot spins: the bookend or jackpot card is the celebration, so no plate and no flashing", () => {
    const c = celebrationFor({ ...base, winCents: 5000, feature: true });
    expect(c.plate).toBeNull();
    expect(c.live).toBe(false);
    expect(c.glow).toBe(4);
  });
  it("sparks are deterministic and evenly spread", () => {
    expect(sparkLayout(0)).toEqual([]);
    const s = sparkLayout(8);
    expect(s.map((x) => x.angle)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
    expect(sparkLayout(8)).toEqual(s);
  });
});

describe("#6 wired on all seven cabinets", () => {
  it("every cabinet component forwards the celebration to the shared chrome", () => {
    for (const f of ["SlotMachine", "VaultSpireMachine", "MineMachine", "PrairieMachine", "CloverMachine", "BuckshotMachine"]) {
      expect(read(`src/components/${f}.tsx`), f).toMatch(/celebration=\{celebration\}/);
    }
    const chrome = read("src/components/SlotCabinet.tsx");
    expect(chrome).toMatch(/\{after && <WinCelebration celebration=\{celebration\} \/>\}/);
  });
  it("every slot page (Buckshot + Bounty share BuckshotGame) builds it from the server result", () => {
    for (const f of ["src/app/slot/page.tsx", "src/app/vault/page.tsx", "src/app/mine/page.tsx", "src/app/prairie/page.tsx", "src/app/clover/page.tsx", "src/components/BuckshotGame.tsx"]) {
      const s = read(f);
      expect(s, f).toMatch(/celebrationFor\(\{/);
      expect(s, f).toMatch(/celebration=\{cele\}/);
      expect(s, f).toMatch(/glowLive=\{cele\.live\}/);
      expect(s, f).not.toMatch(/FEATURE WIN" amountCents/); // feature banners say FEATURE PAID when ≤ bet
    }
    expect(read("src/app/vault/page.tsx")).toMatch(/feature: hasJackpot/);
    for (const f of ["mine", "prairie", "clover"]) expect(read(`src/app/${f}/page.tsx`)).toMatch(/"FEATURE PAID"/);
  });
  it("the plate makes no sound and the CSS honours reduced motion", () => {
    const comp = read("src/components/WinCelebration.tsx");
    expect(comp).not.toMatch(/play[A-Z]\w*\(/);
    expect(comp).toMatch(/no cash value/);
    const css = read("src/app/wincele.css");
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
    expect(css).toMatch(/prefers-reduced-motion: no-preference/);
    expect(read("src/app/layout.tsx")).toMatch(/wincele\.css/);
  });
});
