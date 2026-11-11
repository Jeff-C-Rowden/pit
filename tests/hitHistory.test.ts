import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { VS_TIERS } from "@/lib/games/slotProgressive";
import { ensureAllTiers, getHitHistoryByTier, getRecentProgressiveHits } from "@/lib/progressive";
import { MHB_BANNED_WORDS } from "@/lib/mhbBar";
import {
  HIT_HISTORY_EMPTY,
  HIT_HISTORY_SANDBOX,
  buildHitHistory,
  ceilingPercent,
  rangeLabel,
  tierSummary,
  timeAgo,
  vsCeilingLabel,
} from "@/lib/hitHistory";

const NOW = Date.parse("2026-11-10T12:00:00.000Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const tiers = VS_TIERS.map((t) => ({ id: t.id, name: t.name, seedCents: t.seedCents, ceilingCents: t.ceilingCents }));

describe("J3 hit history — pure logic", () => {
  it("relative time ago", () => {
    expect(timeAgo(iso(10_000), NOW)).toBe("just now");
    expect(timeAgo(iso(50_000), NOW)).toBe("1m ago");
    expect(timeAgo(iso(12 * 60_000), NOW)).toBe("12m ago");
    expect(timeAgo(iso(5 * 3_600_000), NOW)).toBe("5h ago");
    expect(timeAgo(iso(72 * 3_600_000), NOW)).toBe("3d ago");
    expect(timeAgo("garbage", NOW)).toBe("");
  });

  it("meter-at-hit vs the real ceiling; Grand has no cap", () => {
    expect(ceilingPercent(2_700, 3_000)).toBe(90);
    expect(ceilingPercent(3_004, 3_000)).toBe(100);
    expect(ceilingPercent(5_000, null)).toBeNull();
    expect(vsCeilingLabel(2_700, 3_000)).toBe("at 90% of $30 cap");
    expect(vsCeilingLabel(62_500, 100_000)).toBe("at 63% of $1,000 cap");
    expect(vsCeilingLabel(260_000, null)).toBe("Mystery · no cap");
    expect(rangeLabel(tiers[0]!)).toBe("Seed $10 · hits by $30");
    expect(rangeLabel(tiers[3]!)).toBe("Seed $2,500 · mystery, no cap");
  });

  it("every tier gets an empty state when there are no hits — no placeholders", () => {
    for (const input of [[], null, undefined, "x", [{ bogus: 1 }]]) {
      const h = buildHitHistory(input, tiers, NOW);
      expect(h.map((t) => t.name)).toEqual(["Mini", "Minor", "Major", "Grand"]);
      for (const t of h) {
        expect(t.rows).toEqual([]);
        expect(t.empty).toBe(true);
        expect(tierSummary(t)).toBe(HIT_HISTORY_EMPTY);
      }
    }
    expect(HIT_HISTORY_EMPTY).toBe("No hits yet");
    expect(HIT_HISTORY_SANDBOX).toBe("Sandbox chips · no cash value");
  });

  it("groups by tier, newest first, capped at 10, drops malformed/unknown rows", () => {
    const hits = [
      ...Array.from({ length: 13 }, (_, i) => ({ tierId: "vault-mini", amountCents: 2_000 + i, at: iso(i * 60_000), displayName: "Ann B." })),
      { tierId: "vault-major", amountCents: 80_000, at: iso(3_600_000), displayName: "Cal D." },
      { tierId: "vault-major", amountCents: 99_000, at: iso(60_000), displayName: "" },
      { tierId: "vault-nope", amountCents: 500, at: iso(0) },
      { tierId: "vault-minor", amountCents: -5, at: iso(0) },
      { tierId: "vault-minor", amountCents: 9_000, at: "not a date" },
      { tierId: "vault-grand", amountCents: Number.NaN, at: iso(0) },
    ];
    const h = buildHitHistory(hits, tiers, NOW);
    const [mini, minor, major, grand] = h;
    expect(mini!.rows).toHaveLength(10);
    expect(mini!.rows[0]!.amountCents).toBe(2_000); // newest
    expect(mini!.rows[9]!.amountCents).toBe(2_009);
    expect(tierSummary(mini!)).toBe("Last 10");
    expect(minor!.empty).toBe(true);
    expect(grand!.empty).toBe(true);
    expect(major!.rows.map((r) => r.amountCents)).toEqual([99_000, 80_000]);
    expect(major!.rows[0]!.who).toBe("Player");
    expect(major!.rows[0]!.vsCeiling).toBe("at 99% of $1,000 cap");
    expect(major!.rows[1]!.ago).toBe("1h ago");
    expect(tierSummary(major!)).toBe("2 hits");
    // Never more rows than real records.
    const total = h.reduce((a, t) => a + t.rows.length, 0);
    expect(total).toBe(12);
  });

  it("copy never uses due / hot wording", () => {
    const h = buildHitHistory(
      [{ tierId: "vault-mini", amountCents: 2_999, at: iso(0), displayName: "Ann B." }],
      tiers,
      NOW,
    );
    const text = JSON.stringify(h) + readFileSync("src/components/HitHistory.tsx", "utf8") + readFileSync("src/lib/hitHistory.ts", "utf8").replace(/\/\*\*[\s\S]*?\*\//g, "");
    expect(MHB_BANNED_WORDS.test(text)).toBe(false);
    const ui = readFileSync("src/components/HitHistory.tsx", "utf8");
    expect(ui).toContain("HIT_HISTORY_SANDBOX");
    expect(ui).toContain("HIT_HISTORY_EMPTY");
  });

  it("vault page renders the strip from the GET hitHistory field", () => {
    const page = readFileSync("src/app/vault/page.tsx", "utf8");
    expect(page).toMatch(/<HitHistoryStrip[^>]*info\.hitHistory/);
    const route = readFileSync("src/app/api/games/slot-progressive/route.ts", "utf8");
    expect(route).toMatch(/hitHistory: getHitHistoryByTier\(\)/);
  });
});

describe("J3 hit history — server query over real progressive_hits", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, display_name TEXT NOT NULL,
        age_confirmed INTEGER NOT NULL DEFAULT 0, balance_cents INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE progressive_meters (id TEXT PRIMARY KEY, amount_cents INTEGER NOT NULL, seed_cents INTEGER NOT NULL,
        contribution_bps INTEGER NOT NULL, ceiling_cents INTEGER, trigger_cents INTEGER, last_hit_at TEXT, updated_at TEXT NOT NULL);
    `);
    ensureAllTiers(db);
  });

  it("is empty when nobody has hit", () => {
    expect(getHitHistoryByTier(db)).toEqual([]);
  });

  it("returns up to 10 per tier even when one tier dominates recent hits", () => {
    db.prepare("INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES ('u1','a@x','x','Jeff Rowden',?)").run(iso(0));
    const ins = db.prepare("INSERT INTO progressive_hits (id, tier_id, tier_name, amount_cents, user_id, created_at) VALUES (?,?,?,?,?,?)");
    for (let i = 0; i < 25; i++) ins.run(`m${i}`, "vault-mini", "Mini", 2_000 + i, "u1", iso(i * 1_000));
    ins.run("j1", "vault-major", "Major", 77_000, null, iso(10 * 86_400_000));
    // The global recent list (8) is all Mini, so the old Major hit is only visible per tier.
    expect(getRecentProgressiveHits(db).every((h) => h.tierId === "vault-mini")).toBe(true);
    const rows = getHitHistoryByTier(db);
    expect(rows.filter((r) => r.tierId === "vault-mini")).toHaveLength(10);
    const major = rows.filter((r) => r.tierId === "vault-major");
    expect(major).toEqual([{ tier: "Major", tierId: "vault-major", amountCents: 77_000, at: iso(10 * 86_400_000), displayName: "Player" }]);
    // Privacy-safe: first name + last initial, never the full name or user id.
    const mini0 = rows.find((r) => r.tierId === "vault-mini")!;
    expect(mini0.displayName).toBe("Jeff R.");
    expect(JSON.stringify(rows)).not.toMatch(/Rowden|u1/);
    expect(mini0.amountCents).toBe(2_000);
    const h = buildHitHistory(rows, tiers, NOW);
    expect(h.map((t) => t.rows.length)).toEqual([10, 0, 1, 0]);
  });
});
