import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { VS_TIERS, VS_LINE_COUNT, VS_MAX_COIN_CENTS, VS_MIN_COIN_CENTS, splitContributionUnbiased } from "../src/lib/games/slotProgressive";
import { applyProgressiveSpin, ensureAllTiers, rollTriggerCents } from "../src/lib/progressive";
import {
  BANNED_ODDS_WORDS,
  NEXT_SPIN_NOTE,
  allNextSpinOdds,
  formatChance,
  mustHitChance,
  mysteryChance,
  shownChanceValue,
  tierNextSpinOdds,
} from "../src/lib/nextSpinOdds";

const mini = VS_TIERS.find((t) => t.id === "vault-mini")!;
const minor = VS_TIERS.find((t) => t.id === "vault-minor")!;
const major = VS_TIERS.find((t) => t.id === "vault-major")!;
const grand = VS_TIERS.find((t) => t.id === "vault-grand")!;

function meterDb() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE progressive_meters (
    id TEXT PRIMARY KEY, amount_cents INTEGER NOT NULL, seed_cents INTEGER NOT NULL,
    contribution_bps INTEGER NOT NULL, ceiling_cents INTEGER, trigger_cents INTEGER,
    last_hit_at TEXT, updated_at TEXT NOT NULL);`);
  ensureAllTiers(db);
  return db;
}

describe("JD1 next-spin odds — exact formula", () => {
  it("equals r*b/(C-V) when one spin's contribution cannot reach the ceiling", () => {
    // $1 coin x 9 lines = 900c; Mini 100 bps -> exactly 9c per spin.
    const c = mustHitChance({ progressiveCents: 2_000, seedCents: 1_000, ceilingCents: 3_000 }, 100, 900);
    expect(c.num / c.den).toBeCloseTo(9 / 1_000, 12);
    // Fractional contribution (Major 50 bps of 225c = 1.125c): still exactly r*b/(C-V).
    const m = mustHitChance({ progressiveCents: 40_000, seedCents: 25_000, ceilingCents: 100_000 }, 50, 225);
    expect(m.num / m.den).toBeCloseTo(1.125 / 60_000, 15);
  });

  it("at a fresh reseed (meter = seed) uses the inclusive trigger range (r*b+1)/(C-S+1)", () => {
    const c = mustHitChance({ progressiveCents: 1_000, seedCents: 1_000, ceilingCents: 3_000 }, 100, 900);
    expect(c.num / c.den).toBeCloseTo(10 / 2_001, 12);
  });

  it("caps at 1 when the contribution reaches the ceiling", () => {
    const bet = VS_MAX_COIN_CENTS * VS_LINE_COUNT; // 45,000c -> Mini 450c
    const c = mustHitChance({ progressiveCents: 2_700, seedCents: 1_000, ceilingCents: 3_000 }, 100, bet);
    expect(c).toEqual({ num: 1, den: 1 });
    expect(formatChance(c)).toBe("100%");
    // One cent short of certain at 1.5c contribution: N=2, c in {1,2} -> 0.5*1/2 + 0.5*1 = 0.75
    const p = mustHitChance({ progressiveCents: 2_998, seedCents: 1_000, ceilingCents: 3_000 }, 100, 150);
    expect(p.num / p.den).toBeCloseTo(0.75, 12);
    const over = mustHitChance({ progressiveCents: 3_000, seedCents: 1_000, ceilingCents: 3_000 }, 100, 225);
    expect(over).toEqual({ num: 1, den: 1 });
  });

  it("Grand shows its fixed per-bet chance from config: bet / mysteryCoinInPerHit", () => {
    const g = mysteryChance(grand.mysteryCoinInPerHitCents!, 900);
    expect(g.num / g.den).toBe(900 / 31_500_000);
    expect(formatChance(g)).toBe("1 in 35,000");
    const o = tierNextSpinOdds({ id: grand.id, name: "Grand", progressiveCents: 999_999, seedCents: 250_000, ceilingCents: null }, 900)!;
    expect(o.kind).toBe("mystery");
    const o2 = tierNextSpinOdds({ id: grand.id, name: "Grand", progressiveCents: 250_000, seedCents: 250_000, ceilingCents: null }, 900)!;
    expect(o2.short).toBe(o.short); // meter value never changes the Grand
  });
});

describe("JD1 display never rounds in the player's favour", () => {
  it("shown chance <= exact chance across a sweep of meters and bets", () => {
    for (const t of [mini, minor, major]) {
      for (let coin = VS_MIN_COIN_CENTS; coin <= VS_MAX_COIN_CENTS; coin += 275) {
        const bet = coin * VS_LINE_COUNT;
        for (let v = t.seedCents; v <= t.ceilingCents!; v += Math.max(1, Math.floor((t.ceilingCents! - t.seedCents) / 97))) {
          const c = mustHitChance({ progressiveCents: v, seedCents: t.seedCents, ceilingCents: t.ceilingCents! }, t.contributionBps, bet);
          const shown = shownChanceValue(formatChance(c));
          expect(shown).toBeLessThanOrEqual(c.num / c.den + 1e-15);
        }
      }
    }
    for (let coin = VS_MIN_COIN_CENTS; coin <= VS_MAX_COIN_CENTS; coin += 25) {
      const g = mysteryChance(grand.mysteryCoinInPerHitCents!, coin * VS_LINE_COUNT);
      expect(shownChanceValue(formatChance(g))).toBeLessThanOrEqual(g.num / g.den + 1e-15);
    }
  });

  it("formats 1 in N with N rounded up and percents rounded down", () => {
    expect(formatChance({ num: 1, den: 3 })).toBe("33%");
    expect(formatChance({ num: 2, den: 3 })).toBe("66%");
    expect(formatChance({ num: 999, den: 100_000 })).toBe("1 in 101");
    expect(formatChance({ num: 9, den: 2_000 })).toBe("1 in 223");
  });
});

describe("JD1 formula matches a simulation of the real trigger model", () => {
  it("Monte Carlo over rollTriggerCents + applyProgressiveSpin agrees with the exact chance", () => {
    // Real model: fresh trigger drawn by ensureAllTiers/rollTriggerCents, then the meter is moved
    // to V by real non-hitting spins' rule (T > V known); we condition by rejection exactly as
    // a player would observe: only rounds where the trigger is above V count.
    const db = meterDb();
    const cases = [
      { t: mini, v: 2_950, coin: 300 }, // contribution 27c, N=50
      { t: mini, v: 1_000, coin: 25 }, // fresh reseed, 2.25c
      { t: minor, v: 14_900, coin: 1_000 }, // 63c, N=100
      { t: major, v: 99_800, coin: 200 }, // 9c, N=200
    ];
    for (const cse of cases) {
      const bet = cse.coin * VS_LINE_COUNT;
      const exact = mustHitChance({ progressiveCents: cse.v, seedCents: cse.t.seedCents, ceilingCents: cse.t.ceilingCents! }, cse.t.contributionBps, bet);
      const p = exact.num / exact.den;
      let trials = 0;
      let hits = 0;
      while (trials < 4_000) {
        // Hidden point drawn by the real roll; rejection keeps only rounds consistent with the
        // meter showing V (after a checked spin the trigger must be above V).
        const trig = rollTriggerCents(cse.t)!;
        const fresh = cse.v === cse.t.seedCents;
        if (!fresh && trig <= cse.v) continue;
        db.prepare("UPDATE progressive_meters SET amount_cents = ?, trigger_cents = ? WHERE id = ?").run(cse.v, trig, cse.t.id);
        const contrib = splitContributionUnbiased(bet);
        const only = { "vault-mini": 0, "vault-minor": 0, "vault-major": 0, "vault-grand": 0 } as Record<string, number>;
        only[cse.t.id] = contrib[cse.t.id];
        const res = applyProgressiveSpin({ contributionByTier: only as any }, db);
        trials++;
        if (res.hits.some((h) => h.tierId === cse.t.id)) hits++;
      }
      const se = Math.sqrt((p * (1 - p)) / trials);
      expect(Math.abs(hits / trials - p)).toBeLessThan(4 * se + 0.002);
    }
  });

  it("Grand mystery simulation matches bet / coin-in-per-hit", () => {
    // Use the legacy-free bet path: P = bet / M. Large bet to keep the test fast.
    const M = grand.mysteryCoinInPerHitCents!;
    const bet = VS_MAX_COIN_CENTS * VS_LINE_COUNT;
    const p = mysteryChance(M, bet).num / M;
    const db = meterDb();
    let hits = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const res = applyProgressiveSpin({ contributionByTier: { "vault-mini": 0, "vault-minor": 0, "vault-major": 0, "vault-grand": 0 }, betCents: bet }, db);
      if (res.hits.some((h) => h.tierId === grand.id)) hits++;
    }
    const se = Math.sqrt((p * (1 - p)) / n);
    expect(Math.abs(hits / n - p)).toBeLessThan(4 * se + 0.0005);
  });
});

describe("JD1 wording", () => {
  it("uses no due/hot/almost wording in any line or the note", () => {
    const meters = [
      { id: mini.id, name: "Mini", progressiveCents: 2_990, seedCents: 1_000, ceilingCents: 3_000 },
      { id: minor.id, name: "Minor", progressiveCents: 5_000, seedCents: 5_000, ceilingCents: 15_000 },
      { id: major.id, name: "Major", progressiveCents: 99_999, seedCents: 25_000, ceilingCents: 100_000 },
      { id: grand.id, name: "Grand", progressiveCents: 300_000, seedCents: 250_000, ceilingCents: null },
    ];
    const texts = [NEXT_SPIN_NOTE];
    for (const bet of [225, 900, 45_000]) for (const o of allNextSpinOdds(meters, bet)) texts.push(o.short, o.long);
    for (const s of texts) {
      for (const w of BANNED_ODDS_WORDS) expect(new RegExp(`\\b${w}\\b`, "i").test(s), `${w} in "${s}"`).toBe(false);
    }
    expect(NEXT_SPIN_NOTE).toMatch(/Every spin has this chance/);
    expect(NEXT_SPIN_NOTE).toMatch(/Sandbox \/ test chips/);
  });
});
