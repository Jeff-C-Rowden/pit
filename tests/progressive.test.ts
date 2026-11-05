import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import {
  VS_TIERS,
  VS_TOTAL_CONTRIBUTION_BPS,
  splitContribution,
  contributionCents,
  spinVaultSpire,
  evaluateVsGrid,
} from "../src/lib/games/slotProgressive";
import {
  applyProgressiveSpin,
  ensureAllTiers,
  getRecentProgressiveHits,
  privacyDisplayName,
  publicMeters,
  rollTriggerCents,
} from "../src/lib/progressive";

describe("canopy spire progressive model", () => {
  it("has 4 tiers totaling 300 bps with target seeds/ceilings", () => {
    expect(VS_TIERS).toHaveLength(4);
    expect(VS_TOTAL_CONTRIBUTION_BPS).toBe(300);
    expect(VS_TIERS.map((t) => t.seedCents)).toEqual([1000, 5000, 25000, 250000]);
    expect(VS_TIERS.map((t) => t.ceilingCents)).toEqual([3000, 15000, 100000, null]);
    expect(VS_TIERS.map((t) => t.contributionBps)).toEqual([100, 70, 50, 80]);
  });

  it("splits contribution with remainder to Grand", () => {
    const bet = 900; // $1 coin × 9 lines
    const parts = splitContribution(bet);
    const sum = Object.values(parts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(contributionCents(bet));
    expect(sum).toBe(Math.floor((bet * 300) / 10_000));
  });

  it("spin returns grid and contribution metadata", () => {
    const s = spinVaultSpire(100);
    expect(s.grid).toHaveLength(5);
    expect(s.grid.every((col) => col.length === 3)).toBe(true);
    expect(s.betCents).toBe(900);
    expect(s.contributionCents).toBe(contributionCents(900));
  });

  it("evaluate pays 5 WILD on center line", () => {
    const grid = [
      ["VINE", "WILD", "VINE"],
      ["COCONUT", "WILD", "COCONUT"],
      ["BANANA", "WILD", "BANANA"],
      ["TOUCAN", "WILD", "TOUCAN"],
      ["PARROT", "WILD", "PARROT"],
    ] as any;
    const ev = evaluateVsGrid(grid, 1);
    const line0 = ev.lines.find((l) => l.line === 0);
    expect(line0?.pay).toBe(800);
  });
});

describe("progressive meters", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE progressive_meters (
        id TEXT PRIMARY KEY,
        amount_cents INTEGER NOT NULL,
        seed_cents INTEGER NOT NULL,
        contribution_bps INTEGER NOT NULL,
        ceiling_cents INTEGER,
        trigger_cents INTEGER,
        last_hit_at TEXT,
        updated_at TEXT NOT NULL
      );
    `);
  });

  it("seeds all tiers and hides triggers from public meters", () => {
    const rows = ensureAllTiers(db);
    expect(rows).toHaveLength(4);
    const pub = publicMeters(rows);
    expect(pub.every((m) => !("triggerCents" in m) && !("trigger_cents" in m))).toBe(true);
    expect(pub.find((m) => m.name === "Grand")?.hasMustHitBy).toBe(false);
    expect(pub.find((m) => m.name === "Mini")?.hasMustHitBy).toBe(true);
  });

  it("contributes and can MHB-hit then reseed", () => {
    ensureAllTiers(db);
    // Force mini near trigger
    const mini = db.prepare("SELECT * FROM progressive_meters WHERE id = ?").get("vault-mini") as any;
    const trigger = mini.trigger_cents ?? 2500;
    db.prepare("UPDATE progressive_meters SET amount_cents = ? WHERE id = ?").run(trigger - 1, "vault-mini");

    const contrib = { "vault-mini": 5, "vault-minor": 0, "vault-major": 0, "vault-grand": 0 } as any;
    const res = applyProgressiveSpin({ contributionByTier: contrib }, db);
    expect(res.hits.some((h) => h.tierId === "vault-mini")).toBe(true);
    expect(res.progressiveAwardCents).toBeGreaterThanOrEqual(trigger);
    const after = db.prepare("SELECT * FROM progressive_meters WHERE id = ?").get("vault-mini") as any;
    expect(after.amount_cents).toBe(1000); // reseed
  });

  it("rollTrigger stays in [seed, ceiling]", () => {
    for (const t of VS_TIERS.filter((x) => x.ceilingCents != null)) {
      for (let i = 0; i < 20; i++) {
        const v = rollTriggerCents(t)!;
        expect(v).toBeGreaterThanOrEqual(t.seedCents);
        expect(v).toBeLessThanOrEqual(t.ceilingCents!);
      }
    }
    expect(rollTriggerCents(VS_TIERS[3]!)).toBeNull();
  });
});

describe("progressive last-won history", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        age_confirmed INTEGER NOT NULL DEFAULT 0,
        is_operator INTEGER NOT NULL DEFAULT 0,
        balance_cents INTEGER NOT NULL DEFAULT 0,
        deposit_limit_cents INTEGER,
        loss_limit_cents INTEGER,
        created_at TEXT NOT NULL
      );
      CREATE TABLE progressive_meters (
        id TEXT PRIMARY KEY,
        amount_cents INTEGER NOT NULL,
        seed_cents INTEGER NOT NULL,
        contribution_bps INTEGER NOT NULL,
        ceiling_cents INTEGER,
        trigger_cents INTEGER,
        last_hit_at TEXT,
        updated_at TEXT NOT NULL
      );
    `);
  });

  it("returns an empty recentHits list when nobody has hit", () => {
    ensureAllTiers(db);
    expect(getRecentProgressiveHits(db)).toEqual([]);
  });

  it("never invents winners and records only real hits", () => {
    ensureAllTiers(db);
    db.prepare(
      `INSERT INTO users (id, email, password_hash, display_name, age_confirmed, balance_cents, created_at)
       VALUES (?, ?, ?, ?, 1, 0, ?)`,
    ).run("u1", "a@example.com", "x", "Jeff Rowden", new Date().toISOString());

    // No contribution → no hit → still empty
    const miss = applyProgressiveSpin(
      {
        contributionByTier: { "vault-mini": 0, "vault-minor": 0, "vault-major": 0, "vault-grand": 0 },
        userId: "u1",
      },
      db,
    );
    expect(miss.hits).toHaveLength(0);
    expect(getRecentProgressiveHits(db)).toEqual([]);

    const mini = db.prepare("SELECT * FROM progressive_meters WHERE id = ?").get("vault-mini") as any;
    const trigger = mini.trigger_cents ?? 2500;
    db.prepare("UPDATE progressive_meters SET amount_cents = ? WHERE id = ?").run(trigger - 1, "vault-mini");

    const hit = applyProgressiveSpin(
      {
        contributionByTier: { "vault-mini": 5, "vault-minor": 0, "vault-major": 0, "vault-grand": 0 },
        userId: "u1",
      },
      db,
    );
    expect(hit.hits).toHaveLength(1);
    expect(hit.hits[0]!.tierId).toBe("vault-mini");

    const recent = getRecentProgressiveHits(db);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.tier).toBe("Mini");
    expect(recent[0]!.tierId).toBe("vault-mini");
    expect(recent[0]!.amountCents).toBe(hit.hits[0]!.awardCents);
    expect(recent[0]!.displayName).toBe("Jeff R.");
    expect(typeof recent[0]!.at).toBe("string");
    expect(recent[0]!.at.length).toBeGreaterThan(10);

    // Public API shape: only the documented fields, no fake filler rows
    expect(Object.keys(recent[0]!).sort()).toEqual(
      ["amountCents", "at", "displayName", "tier", "tierId"].sort(),
    );
  });

  it("caps history newest-first and uses Player when name unknown", () => {
    ensureAllTiers(db);
    for (let i = 0; i < 3; i++) {
      const mini = db.prepare("SELECT * FROM progressive_meters WHERE id = ?").get("vault-mini") as any;
      const trigger = mini.trigger_cents ?? 2500;
      db.prepare("UPDATE progressive_meters SET amount_cents = ? WHERE id = ?").run(trigger - 1, "vault-mini");
      applyProgressiveSpin(
        {
          contributionByTier: { "vault-mini": 5, "vault-minor": 0, "vault-major": 0, "vault-grand": 0 },
          userId: null,
        },
        db,
      );
    }
    const recent = getRecentProgressiveHits(db, 2);
    expect(recent).toHaveLength(2);
    expect(recent.every((h) => h.displayName === "Player")).toBe(true);
    expect(Date.parse(recent[0]!.at)).toBeGreaterThanOrEqual(Date.parse(recent[1]!.at));
  });

  it("privacyDisplayName never invents a name", () => {
    expect(privacyDisplayName(null)).toBe("Player");
    expect(privacyDisplayName("")).toBe("Player");
    expect(privacyDisplayName("Ada")).toBe("Ada");
    expect(privacyDisplayName("Ada Lovelace")).toBe("Ada L.");
  });
});
