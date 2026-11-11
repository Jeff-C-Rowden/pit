import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { TABLE_TIPS, rulesHref } from "@/lib/feel";

const rules = readFileSync("src/app/rules/page.tsx", "utf8");
const games = ["slot", "vault", "roulette", "blackjack", "craps", "holdem", "paigow"];

describe("how-to-play coach cards (backlog #5)", () => {
  it("every table has steps and an odds line", () => {
    for (const g of games) {
      const t = TABLE_TIPS[g]!;
      expect(t, g).toBeTruthy();
      expect(t.steps.length).toBeGreaterThanOrEqual(3);
      expect(t.odds.length).toBeGreaterThan(20);
    }
  });
  it("links to a matching anchor on the rules page", () => {
    for (const g of games) {
      expect(rulesHref(g)).toBe(`/rules#${g}`);
      expect(rules).toContain(`id="${g}"`);
    }
  });
  it("odds figures match what /rules publishes", () => {
    expect(rules).toContain("5.26%");
    expect(TABLE_TIPS.roulette!.odds).toContain("5.26%");
    expect(rules).toContain("95.53%");
    expect(TABLE_TIPS.slot!.odds).toContain("95.53%");
    expect(rules).toContain("0.5%");
    expect(TABLE_TIPS.blackjack!.odds).toContain("0.5%");
    expect(rules).toContain("1.41%");
    expect(TABLE_TIPS.craps!.odds).toContain("1.41%");
    expect(rules).toContain("89.2%");
    expect(TABLE_TIPS.vault!.odds).toContain("89.2%");
    expect(rules).toMatch(/No rake/);
  });
  it("card keeps sandbox labeling and a reopen button", () => {
    const ux = readFileSync("src/components/TableUX.tsx", "utf8");
    expect(ux).toContain("Sandbox / test chips");
    expect(ux).toContain("How to play · odds");
    expect(ux).toContain("Full rules &amp; odds");
  });
});
