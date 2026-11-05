import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { weekSummary, chicagoWeekStart } from "../src/lib/session";
import { slotGlowTier } from "../src/lib/feel";
import { runningNet } from "../src/components/Sparkline";

function db(rows: [string, number, string][]) {
  const d = new Database(":memory:");
  d.exec("CREATE TABLE ledger (user_id TEXT, type TEXT, amount_cents INTEGER, created_at TEXT)");
  const ins = d.prepare("INSERT INTO ledger VALUES ('u', ?, ?, ?)");
  for (const r of rows) ins.run(...r);
  return d;
}
describe("weekly summary (Chicago week, ledger only)", () => {
  it("week starts Monday 00:00 Chicago", () => {
    // Thu Nov 5 2026 01:22 CST -> Mon Nov 2 00:00 CST = 06:00Z
    expect(chicagoWeekStart(new Date("2026-11-05T07:22:00Z")).toISOString()).toBe("2026-11-02T06:00:00.000Z");
    // Sunday late evening still belongs to the week that began Monday
    expect(chicagoWeekStart(new Date("2026-11-09T05:30:00Z")).toISOString()).toBe("2026-11-02T06:00:00.000Z");
  });
  it("sums time across sessions, net and biggest bet; ignores deposits and last week", () => {
    const d = db([
      ["bet", -9000, "2026-11-01T20:00:00Z"], // last week
      ["deposit", 5000, "2026-11-03T00:00:00Z"],
      ["bet", -1000, "2026-11-03T01:00:00Z"], ["payout", 2000, "2026-11-03T01:10:00Z"],
      ["bet", -2500, "2026-11-04T03:00:00Z"], ["refund", 500, "2026-11-04T03:20:00Z"],
    ]);
    const w = weekSummary(d, "u", new Date("2026-11-05T07:00:00Z"));
    expect(w).toMatchObject({ minutes: 30, netCents: -1000, biggestBetCents: 2500, bets: 2 });
  });
  it("no play is all zeros", () => {
    expect(weekSummary(db([]), "u", new Date("2026-11-05T07:00:00Z"))).toMatchObject({ minutes: 0, netCents: 0, biggestBetCents: 0, bets: 0 });
  });
});
describe("slot glow follows the real paid multiple", () => {
  it("never glows for no pay or pay at or under the bet", () => {
    expect(slotGlowTier(90, 0)).toBe(0); expect(slotGlowTier(90, 45)).toBe(0); expect(slotGlowTier(90, 90)).toBe(0);
  });
  it("tiers by return multiple", () => {
    expect(slotGlowTier(90, 100)).toBe(1); expect(slotGlowTier(90, 180)).toBe(2);
    expect(slotGlowTier(90, 540)).toBe(3); expect(slotGlowTier(90, 1890)).toBe(4);
  });
});
describe("sparkline running net", () => {
  it("starts at zero and walks the ledger oldest first, skipping deposits", () => {
    expect(runningNet([
      { type: "payout", amountCents: 300 }, { type: "deposit", amountCents: 5000 },
      { type: "bet", amountCents: -100 }, { type: "bet", amountCents: -200 },
    ])).toEqual([0, -200, -300, 0]);
  });
});

describe("Canopy Spire glow uses the same honest tiers on coin×9 bets", () => {
  // Vault coin-in is coin × 9 paylines; glow must stay dark on loss/push/sub-bet.
  it("tier 0 for loss, push, and return under the bet", () => {
    expect(slotGlowTier(900, 0)).toBe(0);
    expect(slotGlowTier(900, 450)).toBe(0);
    expect(slotGlowTier(900, 900)).toBe(0);
    expect(slotGlowTier(0, 5000)).toBe(0);
    expect(slotGlowTier(null, 5000)).toBe(0);
    expect(slotGlowTier(900, null)).toBe(0);
  });
  it("scales glow-t1…glow-t4 by real return multiple of the spin bet", () => {
    expect(slotGlowTier(900, 901)).toBe(1);   // profit under 1×
    expect(slotGlowTier(900, 1800)).toBe(2);  // ≥2×
    expect(slotGlowTier(900, 5400)).toBe(3);  // ≥6×
    expect(slotGlowTier(900, 18900)).toBe(4); // ≥21×
  });
});
