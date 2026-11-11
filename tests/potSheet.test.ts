import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  POT_SHEET_BANNED_WORDS,
  POT_SHEET_SANDBOX,
  avgCoinInPerHitCents,
  buildPotSheet,
  potSheetText,
  qualifyingText,
} from "@/lib/potSheet";
import { VS_TIERS, VS_TOTAL_CONTRIBUTION_BPS, VS_MIN_COIN_CENTS, VS_MAX_COIN_CENTS, VS_LINE_COUNT } from "@/lib/games/slotProgressive";

const tier = (name: string) => VS_TIERS.find((t) => t.name === name)!;
const meter = (name: string, cents: number) => {
  const t = tier(name);
  return { id: t.id, name: t.name, progressiveCents: cents, seedCents: t.seedCents, ceilingCents: t.ceilingCents, contributionBps: t.contributionBps };
};
const row = (s: NonNullable<ReturnType<typeof buildPotSheet>>, label: string) => s.rows.find((r) => r.label === label)!.value;

describe("J2 How this pot works sheet", () => {
  it("config is what the sheet pins (seed / cap / bps / mystery)", () => {
    expect(VS_TIERS.map((t) => [t.name, t.seedCents, t.ceilingCents, t.contributionBps])).toEqual([
      ["Mini", 1_000, 3_000, 100],
      ["Minor", 5_000, 15_000, 70],
      ["Major", 25_000, 100_000, 50],
      ["Grand", 250_000, null, 80],
    ]);
    expect(tier("Grand").mysteryCoinInPerHitCents).toBe(31_500_000);
    expect(VS_TOTAL_CONTRIBUTION_BPS).toBe(300);
    expect([VS_MIN_COIN_CENTS, VS_MAX_COIN_CENTS, VS_LINE_COUNT]).toEqual([25, 5000, 9]);
  });

  it("Mini rows: live meter, seed, ceiling, share", () => {
    const s = buildPotSheet(meter("Mini", 2_345))!;
    expect(s.kind).toBe("must-hit");
    expect(row(s, "Meter now")).toBe("$23.45");
    expect(row(s, "Resets to (seed)")).toBe("$10");
    expect(row(s, "Must hit by")).toBe("$30");
    expect(row(s, "Share of each bet")).toBe("1.00% (all four pots: 3.00%)");
    expect(s.notes[0]).toContain("A small part of each qualifying bet feeds this pot: 1.00%");
    expect(s.notes[2]).toContain("hidden point between $10 and $30");
  });

  it("Minor / Major use their own config", () => {
    const mi = buildPotSheet(meter("Minor", 5_000))!;
    expect(row(mi, "Must hit by")).toBe("$150");
    expect(row(mi, "Share of each bet")).toMatch(/^0\.70%/);
    const ma = buildPotSheet(meter("Major", 99_999))!;
    expect(row(ma, "Resets to (seed)")).toBe("$250");
    expect(row(ma, "Must hit by")).toBe("$1,000");
    expect(row(ma, "Share of each bet")).toMatch(/^0\.50%/);
  });

  it("Grand: mystery, no cap, exact per-spin chance from config", () => {
    const g = buildPotSheet(meter("Grand", 412_345))!;
    expect(g.kind).toBe("mystery");
    expect(row(g, "Must hit by")).toBe("No cap (mystery)");
    expect(row(g, "Resets to (seed)")).toBe("$2,500");
    expect(row(g, "Share of each bet")).toMatch(/^0\.80%/);
    expect(g.notes[2]).toContain("your bet ÷ $315,000 (1 in 35,000 on a $9 spin)");
    expect(g.notes[2]).toContain("does not change that chance");
  });

  it("averages come from config and are labeled not next-spin odds", () => {
    expect(avgCoinInPerHitCents(tier("Mini"))).toBeCloseTo(100_000, 6); // $1,000
    expect(avgCoinInPerHitCents(tier("Minor"))).toBeCloseTo(5_000 / 0.007, 6); // ≈ $7,143
    expect(avgCoinInPerHitCents(tier("Major"))).toBeCloseTo(7_500_000, 6); // $75,000
    expect(avgCoinInPerHitCents(tier("Grand"))).toBe(31_500_000); // $315,000
    const texts = ["Mini", "Minor", "Major", "Grand"].map((n) => buildPotSheet(meter(n, tier(n).seedCents))!.average!);
    expect(texts.map((t) => t.text.match(/about (\$[\d,]+)/)![1])).toEqual(["$1,000", "$7,143", "$75,000", "$315,000"]);
    for (const t of texts) expect(t.caveat).toMatch(/average.*not the odds of the next spin/i);
    expect(avgCoinInPerHitCents({ seedCents: 1, ceilingCents: null, contributionBps: 10, mysteryCoinInPerHitCents: null, mysteryOddsPerSpin: null })).toBeNull();
  });

  it("qualifying bets come from the real coin limits", () => {
    expect(qualifyingText()).toBe(
      "Every Antler Ridge spin qualifies: any coin from $0.25 to $50 on all 9 lines ($2.25–$450 a spin). No side bet or minimum is needed.",
    );
  });

  it("falls back to config when the meter lacks fields; unknown tier → null", () => {
    const s = buildPotSheet({ id: "vault-major", name: "Major", progressiveCents: 30_000 })!;
    expect(row(s, "Must hit by")).toBe("$1,000");
    expect(buildPotSheet({ id: "nope", name: "Nope", progressiveCents: 1 })).toBeNull();
  });

  it("sandbox label, no due/hot wording, never leaks a trigger", () => {
    for (const n of ["Mini", "Minor", "Major", "Grand"]) {
      const s = buildPotSheet({ ...meter(n, tier(n).seedCents + 7), triggerCents: 2_222 } as never)!;
      expect(s.sandbox).toBe(POT_SHEET_SANDBOX);
      expect(s.sandbox).toMatch(/Sandbox \/ test chips, no cash value/);
      const txt = potSheetText(s);
      expect(txt).not.toMatch(POT_SHEET_BANNED_WORDS);
      expect(txt).not.toContain("$22.22");
    }
  });

  it("UI wiring: dialog semantics, Esc, both meters open the sheet", () => {
    const comp = readFileSync("src/components/PotSheet.tsx", "utf8");
    expect(comp).toContain('role="dialog"');
    expect(comp).toContain('aria-modal="true"');
    expect(comp).toContain('"Escape"');
    expect(comp).toContain("closeRef.current?.focus()");
    const vault = readFileSync("src/app/vault/page.tsx", "utf8");
    expect(vault).toMatch(/<PotSheet meter=/);
    const floor = readFileSync("src/app/floor/page.tsx", "utf8");
    expect(floor).toMatch(/<PotSheet meter=/);
    expect(floor).toContain('className={`vault-lobby-tier vault-lobby-tier-btn');
    const css = readFileSync("src/app/stag.css", "utf8");
    const block = css.slice(css.indexOf("Jackpot Desk J2"));
    expect(block).not.toMatch(/animation|transition/);
  });
});
