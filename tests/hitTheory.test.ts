import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { VS_TIERS, VS_LINE_COUNT, splitContributionUnbiased } from "../src/lib/games/slotProgressive";
import { applyProgressiveSpin, ensureAllTiers, getHitSamplesByTier, rollTriggerCents } from "../src/lib/progressive";
import { BANNED_ODDS_WORDS } from "../src/lib/nextSpinOdds";
import { MHB_BANNED_WORDS } from "../src/lib/mhbBar";
import {
  ALL_TIER_THEORY,
  THEORY_MIN_HITS,
  THEORY_NOT_ENOUGH,
  THEORY_NOTE,
  THEORY_WINDOW,
  buildTheoryCompare,
  money,
  theoryExplainer,
  tierTheory,
} from "../src/lib/hitTheory";

const tier = (id: string) => VS_TIERS.find((t) => t.id === id)!;
const mini = tier("vault-mini");
const minor = tier("vault-minor");
const major = tier("vault-major");
const grand = tier("vault-grand");

function meterDb() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE progressive_meters (
    id TEXT PRIMARY KEY, amount_cents INTEGER NOT NULL, seed_cents INTEGER NOT NULL,
    contribution_bps INTEGER NOT NULL, ceiling_cents INTEGER, trigger_cents INTEGER,
    last_hit_at TEXT, updated_at TEXT NOT NULL);`);
  ensureAllTiers(db);
  return db;
}
const zero = () => ({ "vault-mini": 0, "vault-minor": 0, "vault-major": 0, "vault-grand": 0 }) as Record<string, number>;

describe("JD4 theory derived from the live config", () => {
  it("matches the closed forms for the real VS_TIERS", () => {
    // Mini: seed $10, cap $30, 1% → avg hit $20, coin-in (3000-1000)/(2*0.01) = $1,000.
    const m = tierTheory(mini);
    expect(m.hitMeanCents).toBe((mini.seedCents + mini.ceilingCents!) / 2);
    expect(m.coinInMeanCents).toBeCloseTo((mini.ceilingCents! - mini.seedCents) / (2 * (mini.contributionBps / 10_000)), 6);
    expect(m.hitMeanCents).toBe(2_000);
    expect(m.coinInMeanCents).toBeCloseTo(100_000, 6);
    expect(tierTheory(minor).coinInMeanCents).toBeCloseTo(10_000 / 0.014, 6); // $7,142.86
    expect(tierTheory(major).hitMeanCents).toBe(62_500);
    expect(tierTheory(major).coinInMeanCents).toBeCloseTo(7_500_000, 6);
    // Grand: M = 35,000 x 900 cents = $315,000; avg hit = $2,500 + 0.8% x M = $5,020.
    const g = tierTheory(grand);
    expect(g.kind).toBe("mystery");
    expect(g.coinInMeanCents).toBe(grand.mysteryCoinInPerHitCents);
    expect(g.coinInMeanCents).toBe(31_500_000);
    expect(g.hitMeanCents).toBeCloseTo(502_000, 6);
    expect(ALL_TIER_THEORY.map((t) => t.tierId)).toEqual(VS_TIERS.map((t) => t.id));
  });

  it("discrete uniform SD of the hidden trigger matches rollTriggerCents", () => {
    const th = tierTheory(mini);
    const n = 60_000;
    let s = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const v = rollTriggerCents(mini)!;
      s += v;
      s2 += v * v;
    }
    const mean = s / n;
    const sd = Math.sqrt(s2 / n - mean * mean);
    expect(Math.abs(mean - th.hitMeanCents)).toBeLessThan(4 * (th.hitSdCents / Math.sqrt(n)));
    expect(Math.abs(sd - th.hitSdCents) / th.hitSdCents).toBeLessThan(0.02);
  });

  it("simulated must-hit cycles (real trigger roll + unbiased split) match theory for hit and coin-in", () => {
    // Coin sizes per tier keep each cycle to a few hundred spins so the run stays quick.
    const plan: [typeof mini, number[]][] = [[mini, [25, 300]], [minor, [100, 1_000]], [major, [500, 5_000]]];
    for (const [t, coins] of plan) {
      const th = tierTheory(t);
      for (const coin of coins) {
        const bet = coin * VS_LINE_COUNT;
        const cycles = 1_500;
        let sumHit = 0;
        let sumCoin = 0;
        for (let k = 0; k < cycles; k++) {
          const T = rollTriggerCents(t)!;
          let meter = t.seedCents;
          let coinIn = 0;
          for (;;) {
            meter += splitContributionUnbiased(bet)[t.id];
            coinIn += bet;
            if (meter >= T) break;
          }
          sumHit += meter;
          sumCoin += coinIn;
        }
        const seHit = th.hitSdCents / Math.sqrt(cycles);
        const seCoin = th.coinInSdCents / Math.sqrt(cycles);
        // Theory ignores under one spin's contribution (award) / about half a bet (coin-in).
        const maxC = Math.ceil((bet * t.contributionBps) / 10_000);
        expect(Math.abs(sumHit / cycles - th.hitMeanCents)).toBeLessThan(4 * seHit + maxC);
        expect(Math.abs(sumCoin / cycles - th.coinInMeanCents)).toBeLessThan(4 * seCoin + bet);
      }
    }
  });

  it("simulated Grand mystery cycles match theory (coin-in M, hit seed + r*M)", () => {
    const th = tierTheory(grand);
    const M = grand.mysteryCoinInPerHitCents!;
    const bet = 5_000 * VS_LINE_COUNT; // max bet keeps the run short; p = bet / M per spin
    const cycles = 2_000;
    let sumCoin = 0;
    let sumHit = 0;
    for (let k = 0; k < cycles; k++) {
      let coinIn = 0;
      let meter = grand.seedCents;
      for (;;) {
        meter += splitContributionUnbiased(bet)[grand.id];
        coinIn += bet;
        if (Math.random() * M < bet) break;
      }
      sumCoin += coinIn;
      sumHit += meter;
    }
    expect(Math.abs(sumCoin / cycles - th.coinInMeanCents)).toBeLessThan(4 * (th.coinInSdCents / Math.sqrt(cycles)) + bet);
    expect(Math.abs(sumHit / cycles - th.hitMeanCents)).toBeLessThan(4 * (th.hitSdCents / Math.sqrt(cycles)) + 400);
  });

  it("real applyProgressiveSpin records each cycle's coin-in on the hit row", () => {
    const db = meterDb();
    const bet = 300 * VS_LINE_COUNT;
    let spins = 0;
    let hits = 0;
    while (hits < 5 && spins < 20_000) {
      const contrib = zero();
      contrib["vault-mini"] = splitContributionUnbiased(bet)["vault-mini"];
      const res = applyProgressiveSpin({ contributionByTier: contrib as any, betCents: bet, userId: null }, db);
      spins++;
      if (res.hits.some((h) => h.tierId === "vault-mini")) hits++;
    }
    const rows = db
      .prepare("SELECT amount_cents, coin_in_cents FROM progressive_hits WHERE tier_id = 'vault-mini' ORDER BY rowid")
      .all() as { amount_cents: number; coin_in_cents: number | null }[];
    expect(rows.length).toBe(hits);
    const totalCoin = rows.reduce((a, r) => a + (r.coin_in_cents ?? 0), 0);
    const meter = db.prepare("SELECT coin_in_cents FROM progressive_meters WHERE id = 'vault-mini'").get() as { coin_in_cents: number };
    expect(totalCoin + meter.coin_in_cents).toBe(spins * bet); // every bet counted exactly once
    for (const r of rows) expect(r.coin_in_cents! % bet).toBe(0);
    const samples = getHitSamplesByTier(db);
    expect(samples.filter((s) => s.tierId === "vault-mini").map((s) => s.coinInCents).sort()).toEqual(rows.map((r) => r.coin_in_cents).sort());
  });

  it("meters from before tracking record null coin-in, never a guess", () => {
    const db = meterDb();
    db.prepare("UPDATE progressive_meters SET coin_in_cents = NULL, amount_cents = 2999, trigger_cents = 3000 WHERE id = 'vault-mini'").run();
    const c = zero();
    c["vault-mini"] = 5;
    applyProgressiveSpin({ contributionByTier: c as any, betCents: 500 }, db);
    const hit = db.prepare("SELECT coin_in_cents FROM progressive_hits WHERE tier_id = 'vault-mini'").get() as { coin_in_cents: number | null };
    expect(hit.coin_in_cents).toBeNull();
    const m = db.prepare("SELECT coin_in_cents FROM progressive_meters WHERE id = 'vault-mini'").get() as { coin_in_cents: number };
    expect(m.coin_in_cents).toBe(0); // next cycle is tracked from its reseed
  });
});

describe("JD4 compare logic", () => {
  const th = tierTheory(mini);
  const at = (i: number) => new Date(Date.parse("2026-11-18T12:00:00Z") - i * 60_000).toISOString();
  const mk = (n: number, amount: number, coin: number | null = 100_000) =>
    Array.from({ length: n }, (_, i) => ({ tierId: mini.id, amountCents: amount, coinInCents: coin, at: at(i) }));
  const miniOf = (samples: unknown) => buildTheoryCompare(samples).find((t) => t.tierId === mini.id)!;

  it("under 20 real hits shows Not enough hits yet and no actual or flag", () => {
    const c = miniOf(mk(THEORY_MIN_HITS - 1, 2_000));
    expect(c.hit.enough).toBe(false);
    expect(c.hit.actualCents).toBeNull();
    expect(c.hit.drift).toBe(false);
    expect(c.hit.status).toContain(THEORY_NOT_ENOUGH);
    expect(c.hit.status).toContain("19 of 20");
    expect(miniOf([]).hit.status).toContain(THEORY_NOT_ENOUGH);
    expect(miniOf(mk(THEORY_MIN_HITS, 2_000)).hit.enough).toBe(true);
  });

  it("uses only the newest 50 real hits; drops malformed rows", () => {
    const old = mk(70, 9_999).map((h, i) => ({ ...h, at: at(100 + i) }));
    const fresh = mk(THEORY_WINDOW, 2_000);
    const junk = [{ tierId: mini.id, amountCents: -5, at: at(0) }, { tierId: 7 }, null, "x"];
    const c = miniOf([...old, ...junk, ...fresh]);
    expect(c.hit.n).toBe(THEORY_WINDOW);
    expect(c.hit.actualCents).toBe(2_000);
  });

  it("flags drift beyond 3 standard errors only", () => {
    const n = 25;
    const se = th.hitSdCents / Math.sqrt(n);
    const inside = miniOf(mk(n, Math.round(th.hitMeanCents + 2.9 * se)));
    expect(inside.hit.drift).toBe(false);
    expect(inside.hit.status).toMatch(/within 3 standard errors/);
    const outside = miniOf(mk(n, Math.round(th.hitMeanCents + 3.2 * se)));
    expect(outside.hit.drift).toBe(true);
    expect(outside.hit.z!).toBeGreaterThan(3);
    expect(outside.hit.status).toMatch(/more than 3 standard errors/);
    const low = miniOf(mk(n, Math.round(th.hitMeanCents - 3.2 * se)));
    expect(low.hit.drift).toBe(true);
  });

  it("coin-in counts only hits with recorded coin-in", () => {
    const mixed = [...mk(25, 2_000, null), ...mk(10, 2_000, 100_000).map((h, i) => ({ ...h, at: at(200 + i) }))];
    const c = miniOf(mixed);
    expect(c.hit.n).toBe(35);
    expect(c.coinIn.n).toBe(10);
    expect(c.coinIn.enough).toBe(false);
    expect(c.coinIn.status).toContain(THEORY_NOT_ENOUGH);
  });

  it("money formatting", () => {
    expect(money(2_000)).toBe("$20");
    expect(money(714_285.7)).toBe("$7,143");
    expect(money(502_000)).toBe("$5,020");
    expect(money(1_234)).toBe("$12.34");
  });
});

describe("JD4 wording", () => {
  it("never uses due / hot / about-to-hit style words", () => {
    const texts: string[] = [THEORY_NOTE, THEORY_NOT_ENOUGH];
    for (const th of ALL_TIER_THEORY) texts.push(theoryExplainer(th));
    const n = 25;
    for (const th of ALL_TIER_THEORY) {
      for (const k of [-5, 0, 5]) {
        const amt = th.hitMeanCents + (k * th.hitSdCents) / Math.sqrt(n);
        const s = Array.from({ length: n }, () => ({ tierId: th.tierId, amountCents: Math.max(1, Math.round(amt)), coinInCents: Math.round(th.coinInMeanCents) }));
        const c = buildTheoryCompare(s).find((x) => x.tierId === th.tierId)!;
        texts.push(c.hit.status, c.coinIn.status, c.hit.label, c.coinIn.label);
      }
    }
    texts.push(readFileSync("src/components/HitHistory.tsx", "utf8").match(/function TheoryBlock[\s\S]*$/)![0].replace(/className="[^"]*"/g, ""));
    for (const t of texts) {
      for (const w of BANNED_ODDS_WORDS) expect(new RegExp(`\\b${w}\\b`, "i").test(t), `"${w}" in: ${t}`).toBe(false);
      expect(MHB_BANNED_WORDS.test(t), t).toBe(false);
    }
  });

  it("the hit history strip keeps its sandbox chip and renders the theory block", () => {
    const src = readFileSync("src/components/HitHistory.tsx", "utf8");
    expect(src).toContain("<SandboxChip");
    expect(src).toContain("<TheoryBlock");
    expect(readFileSync("src/app/api/games/slot-progressive/route.ts", "utf8")).toContain("hitSamples: getHitSamplesByTier()");
  });
});
