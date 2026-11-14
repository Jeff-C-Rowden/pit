import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { howItPlays, oneIn, TRIGGERS, BANNED_WORDS } from "@/lib/howItPlays";
import { allGameMath, gameMath, SUNDOWN_MATH, BUCKSHOT_MATH, MINE_MATH, PRAIRIE_MATH, CLOVER_MATH, ANTLER_MATH, MINE_FEATURE_LINE, PRAIRIE_FEATURE_LINE, CLOVER_FEATURE_LINE } from "@/lib/gameMath";
import { TABLE_TIPS } from "@/lib/feel";

describe("SS1 how-it-plays tags", () => {
  it("every game in the math table has tags and a trigger line", () => {
    for (const m of allGameMath()) {
      const h = howItPlays(m.id);
      expect(h.tags[0]).toMatchObject({ kind: "rtp", label: m.rtpLine });
      expect(h.tags.find((t) => t.kind === "vol")).toBeTruthy();
      expect(h.trigger.length).toBeGreaterThan(20);
      expect(howItPlays(m.href).id).toBe(m.id);
    }
    expect(Object.keys(TRIGGERS).sort()).toEqual(allGameMath().map((m) => m.id).sort());
  });

  it("volatility tag matches the published bucket", () => {
    for (const m of allGameMath()) {
      const vol = howItPlays(m.id).tags.find((t) => t.kind === "vol")!;
      expect(vol.label).toBe(m.volatility === "by-bet" ? "Volatility by bet" : m.volatility);
    }
  });

  it("win and any-pay frequencies come from the frozen math", () => {
    const tag = (id: string, k: string) => howItPlays(id).tags.find((t) => t.kind === k)?.label;
    expect(tag("slot", "wins")).toBe(`Wins ~1 in ${Math.round(1 / SUNDOWN_MATH.winRate)}`);
    expect(tag("slot", "pays")).toBe(`Pays ~1 in ${Math.max(2, Math.round(1 / SUNDOWN_MATH.hitRate))}`);
    expect(tag("buckshot", "wins")).toBe("Wins ~1 in 11");
    expect(tag("buckshot", "pays")).toBe(`Pays ~1 in ${Math.round(1 / BUCKSHOT_MATH.hitRate)}`);
    expect(tag("mine", "wins")).toBe(`Wins ~1 in ${Math.round(1 / MINE_MATH.winRate)}`);
    expect(tag("prairie", "wins")).toBe(`Wins ~1 in ${Math.round(1 / PRAIRIE_MATH.winRate)}`);
    expect(tag("clover", "pays")).toBe(`Pays ~1 in ${Math.round(1 / CLOVER_MATH.hitRate)}`);
    expect(tag("vault", "wins")).toBe(`Wins ~1 in ${Math.round(1 / ANTLER_MATH.winRate)}`);
    // No made-up hit frequencies where the math table has none.
    expect(tag("vault", "pays")).toBeUndefined();
    for (const id of ["blackjack", "paigow", "holdem", "roulette", "craps"]) {
      expect(tag(id, "wins")).toBeUndefined();
      expect(tag(id, "pays")).toBeUndefined();
    }
  });

  it("'pays' is always at least as frequent as 'wins' and is described as maybe less than the bet", () => {
    for (const m of allGameMath()) {
      const h = howItPlays(m.id);
      const w = h.tags.find((t) => t.kind === "wins");
      const p = h.tags.find((t) => t.kind === "pays");
      if (w && p) {
        const n = (s: string) => Number(s.match(/1 in (\d+)/)![1]);
        expect(n(p.label)).toBeLessThanOrEqual(n(w.label));
        expect(p.long).toMatch(/less than the bet/);
      }
    }
  });

  it("feature trigger odds match the published feature lines", () => {
    const f = (line: string) => [...line.matchAll(/about 1 in (\d+) spins/g)].map((x) => x[1]);
    expect(f(TRIGGERS.mine!)).toEqual(f(MINE_FEATURE_LINE));
    expect(f(TRIGGERS.prairie!)).toEqual(f(PRAIRIE_FEATURE_LINE));
    expect(f(TRIGGERS.clover!)).toEqual(f(CLOVER_FEATURE_LINE));
    // Same trigger rules the coach card already teaches.
    expect(TABLE_TIPS.mine!.steps.join(" ")).toMatch(/3 or more dynamite/);
    expect(TRIGGERS.mine).toMatch(/3\+ dynamite/);
    expect(TABLE_TIPS.prairie!.steps.join(" ")).toMatch(/6 or more gold coins/);
    expect(TRIGGERS.prairie).toMatch(/6\+ gold coins/);
    expect(TRIGGERS.clover).toMatch(/reels 1, 3, 5/);
  });

  it("exact table facts", () => {
    expect(TRIGGERS.roulette).toContain("18 of 38");
    expect((244 / 495 * 100).toFixed(1)).toBe("49.3");
    expect(TRIGGERS.craps).toContain("244 of 495 decisions (49.3%)");
    expect(TRIGGERS.vault).toMatch(/mystery/);
    expect(TRIGGERS.vault).not.toMatch(/Grand must/);
  });

  it("no marketing or 'due' words anywhere in the tags", () => {
    for (const m of allGameMath()) {
      const h = howItPlays(m.id);
      expect(h.aria, m.id).not.toMatch(BANNED_WORDS);
      expect(h.aria).not.toMatch(/next spin|streak|overdue/i);
    }
  });

  it("oneIn never shows 1 in 1 and rejects impossible/certain events", () => {
    expect(oneIn(0)).toBeNull();
    expect(oneIn(1)).toBeNull();
    expect(oneIn(0.9)).toBe(2);
    expect(oneIn(0.008)).toBe(125);
  });

  it("lobby cards and the first-load card render the tags; sandbox labeling stays", () => {
    const floor = readFileSync("src/app/floor/page.tsx", "utf8");
    expect(floor).toContain('<HowItPlays game={g.href} variant="lobby" />');
    const ux = readFileSync("src/components/TableUX.tsx", "utf8");
    expect(ux).toContain('<HowItPlays game={game} variant="first" />');
    expect(ux).toContain("Sandbox / test chips");
    const comp = readFileSync("src/components/HowItPlays.tsx", "utf8");
    expect(comp).toContain("not a prediction of the next spin");
    expect(gameMath("/mine").id).toBe("mine");
  });
});
