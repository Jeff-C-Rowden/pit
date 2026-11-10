import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MHB_BANNED_WORDS, compactDollars, mhbBar, mhbFraction, mhbLabel } from "@/lib/mhbBar";
import { VS_TIERS } from "@/lib/games/slotProgressive";
import { displayCents } from "@/lib/reseedMoment";

const tier = (name: string) => VS_TIERS.find((t) => t.name === name)!;

describe("J1 must-hit-by ceiling bar", () => {
  it("fraction is (current - seed) / (ceiling - seed)", () => {
    expect(mhbFraction(25_000, 25_000, 100_000)).toBe(0);
    expect(mhbFraction(62_500, 25_000, 100_000)).toBe(0.5);
    expect(mhbFraction(100_000, 25_000, 100_000)).toBe(1);
  });

  it("clamps below seed, above ceiling, and on bad input", () => {
    expect(mhbFraction(500, 1_000, 3_000)).toBe(0);
    expect(mhbFraction(3_050, 1_000, 3_000)).toBe(1);
    expect(mhbFraction(Number.NaN, 1_000, 3_000)).toBe(0);
    expect(mhbFraction(2_000, 3_000, 3_000)).toBe(0);
    expect(mhbFraction(3_000, 3_000, 3_000)).toBe(1);
  });

  it("uses the real configured ceilings for capped tiers", () => {
    for (const name of ["Mini", "Minor", "Major"]) {
      const t = tier(name);
      const bar = mhbBar(t, t.seedCents)!;
      expect(bar).not.toBeNull();
      expect(bar.ceilingCents).toBe(t.ceilingCents);
      expect(bar.fraction).toBe(0);
    }
    expect(mhbBar(tier("Major"), 62_500)!.percent).toBe(50);
  });

  it("Grand (uncapped, mystery only) gets no bar", () => {
    const g = tier("Grand");
    expect(g.ceilingCents).toBeNull();
    expect(mhbBar(g, 400_000)).toBeNull();
    expect(mhbBar({ seedCents: 100, ceilingCents: undefined }, 200)).toBeNull();
  });

  it("copy names the real ceiling in compact dollars", () => {
    expect(mhbLabel(100_000)).toBe("Hits by $1,000");
    expect(mhbBar(tier("Mini"), 1_500)!.label).toBe("Hits by $30");
    expect(mhbBar(tier("Minor"), 5_000)!.label).toBe("Hits by $150");
    expect(compactDollars(1_250)).toBe("$12.50");
    expect(compactDollars(123_456_700)).toBe("$1,234,567");
  });

  it("never uses due / hot / about-to-hit wording", () => {
    for (const t of VS_TIERS) {
      for (const c of [t.seedCents, t.seedCents + 1, t.ceilingCents ?? 0]) {
        const bar = mhbBar(t, c);
        if (!bar) continue;
        expect(bar.label).not.toMatch(MHB_BANNED_WORDS);
        expect(bar.ariaLabel).not.toMatch(MHB_BANNED_WORDS);
        expect(bar.ariaLabel).toMatch(/sandbox/i);
      }
    }
  });

  it("respects the J4 reseed moment: bar reads empty (seed) while 'reset to seed' shows", () => {
    const major = tier("Major");
    const moment = { tierId: major.id, tierName: "Major", wonCents: 98_000, seedCents: major.seedCents, until: Date.now() + 5000 };
    const shown = displayCents(98_000, moment);
    expect(mhbBar(major, shown)!.fraction).toBe(0);
  });

  it("is wired into the in-game strip and the lobby meters, reduced-motion safe", () => {
    expect(readFileSync("src/components/ProgressiveMeter.tsx", "utf8")).toMatch(/<MhbBar meter=\{m\} shownCents=\{shown\}/);
    expect(readFileSync("src/app/floor/page.tsx", "utf8")).toMatch(/<MhbBar meter=\{m\}/);
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.mhb-fill \{ transition: none/);
  });
});
