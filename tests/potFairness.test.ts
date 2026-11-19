import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { VS_TIERS, type TierId } from "@/lib/games/slotProgressive";
import { applyProgressiveSpin, ensureAllTiers, getFairness, publicMeters, rollTriggerCents } from "@/lib/progressive";
import {
  checkReveal,
  commitmentHash,
  commitmentPreimage,
  fairnessCopy,
  revealCopy,
  sha256HexWeb,
  shellCheck,
  type FairTier,
} from "@/lib/potFairness";

const BANNED = /\b(due|hot|almost|about to hit|overdue|soon|streak|close|ready|lucky)\b/i;
const tier = (id: string) => VS_TIERS.find((t) => t.id === id)!;
const zero = () => ({ "vault-mini": 0, "vault-minor": 0, "vault-major": 0, "vault-grand": 0 }) as Record<TierId, number>;
const OLD_SCHEMA = `CREATE TABLE progressive_meters (
  id TEXT PRIMARY KEY, amount_cents INTEGER NOT NULL, seed_cents INTEGER NOT NULL,
  contribution_bps INTEGER NOT NULL, ceiling_cents INTEGER, trigger_cents INTEGER,
  last_hit_at TEXT, updated_at TEXT NOT NULL);`;
function freshDb() {
  const db = new Database(":memory:");
  db.exec(OLD_SCHEMA);
  ensureAllTiers(db);
  return db;
}
const meterRow = (db: Database.Database, id: string) =>
  db.prepare("SELECT * FROM progressive_meters WHERE id = ?").get(id) as { amount_cents: number; trigger_cents: number; cycle_id: string };
const cycleRow = (db: Database.Database, id: string) =>
  db.prepare("SELECT * FROM progressive_cycles WHERE id = ?").get(id) as { trigger_cents: number; salt_hex: string; commitment: string; mid_cycle: number; ended_at: string | null };
/** Spin one tier until it pays (all other tiers get nothing). */
function spinUntilHit(db: Database.Database, id: string, step = 7) {
  for (let i = 0; i < 100_000; i++) {
    const before = meterRow(db, id);
    const r = applyProgressiveSpin({ contributionByTier: { ...zero(), [id as TierId]: step }, betCents: 0 }, db);
    if (r.hits.some((h) => h.tierId === id)) return { before, r };
  }
  throw new Error("never hit");
}

describe("JD2 commitment hash", () => {
  it("is SHA-256 of 'trigger|salt|cycle' (UTF-8, lowercase hex) and Node vs WebCrypto agree", async () => {
    const pre = commitmentPreimage(2345, "ab".repeat(32), "c0ffee");
    expect(pre).toBe(`2345|${"ab".repeat(32)}|c0ffee`);
    const h = commitmentHash(2345, "ab".repeat(32), "c0ffee");
    expect(h).toBe(createHash("sha256").update(pre).digest("hex"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256HexWeb(pre)).toBe(h);
    // any change to trigger, salt or cycle changes the hash
    expect(commitmentHash(2346, "ab".repeat(32), "c0ffee")).not.toBe(h);
    expect(commitmentHash(2345, "ac".repeat(32), "c0ffee")).not.toBe(h);
    expect(commitmentHash(2345, "ab".repeat(32), "c0ffef")).not.toBe(h);
    expect(shellCheck(pre)).toBe(`printf '%s' '${pre}' | sha256sum`);
  });

  it("a fresh pot commits at cycle start with a 32-byte random salt per cycle", () => {
    const db = freshDb();
    const salts = new Set<string>();
    for (const t of VS_TIERS) {
      const m = meterRow(db, t.id);
      if (t.ceilingCents == null) { expect(m.cycle_id).toBeNull(); continue; }
      const c = cycleRow(db, m.cycle_id);
      expect(c.trigger_cents).toBe(m.trigger_cents);
      expect(c.salt_hex).toMatch(/^[0-9a-f]{64}$/);
      expect(c.mid_cycle).toBe(0);
      expect(c.commitment).toBe(commitmentHash(c.trigger_cents, c.salt_hex, m.cycle_id));
      salts.add(c.salt_hex);
    }
    expect(salts.size).toBe(3);
    const src = readFileSync("src/lib/progressive.ts", "utf8");
    expect(src).toMatch(/randBytes\(32\)/);
    expect(readFileSync("src/lib/rng.ts", "utf8")).toMatch(/import \{[^}]*randomBytes[^}]*\} from "crypto"/);
  });
});

describe("JD2 no leak before the hit", () => {
  it("open cycle exposes only the commitment; trigger and salt never appear in any public JSON", () => {
    const db = freshDb();
    applyProgressiveSpin({ contributionByTier: { ...zero(), "vault-major": 3 }, betCents: 0 }, db);
    const fair = getFairness(db);
    const meters = publicMeters(ensureAllTiers(db));
    const blob = JSON.stringify({ fair, meters });
    for (const t of VS_TIERS.filter((x) => x.ceilingCents != null)) {
      const m = meterRow(db, t.id);
      const c = cycleRow(db, m.cycle_id);
      const f = fair.find((x) => x.tierId === t.id)!;
      expect(f.current).toEqual({ cycleId: m.cycle_id, commitment: c.commitment, committedAt: expect.any(String), midCycle: false, meterAtCommitCents: t.seedCents });
      expect(Object.keys(f.current!)).not.toContain("triggerCents");
      expect(Object.keys(f.current!)).not.toContain("salt");
      expect(blob).not.toContain(c.salt_hex);
      expect(blob).not.toMatch(new RegExp(`"[a-zA-Z]*[Tt]rigger[a-zA-Z]*":\\s*${c.trigger_cents}\\b`));
      expect(f.revealed).toEqual([]);
    }
    expect(blob).not.toMatch(/trigger_cents|salt_hex|"salt"/);
  });

  it("the fairness API route and the pot sheet only use the public view", () => {
    const route = readFileSync("src/app/api/games/slot-progressive/fairness/route.ts", "utf8");
    expect(route).toMatch(/getFairness\(\)/);
    expect(route).not.toMatch(/trigger_cents|salt_hex|progressive_cycles/);
    const main = readFileSync("src/app/api/games/slot-progressive/route.ts", "utf8");
    expect(main).not.toMatch(/salt|progressive_cycles/);
    const ui = readFileSync("src/components/PotFairness.tsx", "utf8");
    expect(ui).toMatch(/\/api\/games\/slot-progressive\/fairness/);
  });
});

describe("JD2 reveal after the hit + verification", () => {
  it("the hit reveals trigger + salt that hash to the commitment published at cycle start", async () => {
    const db = freshDb();
    const id = "vault-mini";
    const t = tier(id);
    const openId = meterRow(db, id).cycle_id;
    const published = getFairness(db).find((x) => x.tierId === id)!.current!;
    const { before, r } = spinUntilHit(db, id);
    const f = getFairness(db).find((x) => x.tierId === id)!;
    expect(f.revealed).toHaveLength(1);
    const rev = f.revealed[0]!;
    expect(rev.cycleId).toBe(openId);
    expect(rev.commitment).toBe(published.commitment);
    expect(rev.committedAt).toBe(published.committedAt);
    expect(rev.triggerCents).toBe(before.trigger_cents);
    expect(rev.reason).toBe("hit");
    expect(rev.meterBeforeCents).toBe(before.amount_cents);
    expect(rev.hitAmountCents).toBe(r.hits[0]!.awardCents);
    const hex = await sha256HexWeb(rev.preimage);
    const chk = checkReveal(rev, t, hex);
    expect(chk).toEqual({ hashOk: true, preimageOk: true, inRange: true, crossed: true, ok: true });
    // next cycle is open, committed at its start (meter = seed), different id, nothing of it leaked
    expect(f.current!.cycleId).not.toBe(openId);
    expect(f.current!.midCycle).toBe(false);
    expect(f.current!.meterAtCommitCents).toBe(t.seedCents);
    const next = cycleRow(db, f.current!.cycleId);
    expect(next.trigger_cents).toBe(meterRow(db, id).trigger_cents);
    expect(JSON.stringify(getFairness(db))).not.toContain(next.salt_hex);
  });

  it("checkReveal rejects a tampered trigger, salt, cycle or a point outside the range", () => {
    const db = freshDb();
    spinUntilHit(db, "vault-mini");
    const rev = getFairness(db).find((x) => x.tierId === "vault-mini")!.revealed[0]!;
    const mini = tier("vault-mini");
    const good = commitmentHash(rev.triggerCents, rev.salt, rev.cycleId);
    expect(checkReveal(rev, mini, good).ok).toBe(true);
    const tampered = { ...rev, triggerCents: rev.triggerCents + 1 };
    expect(checkReveal(tampered, mini, commitmentHash(tampered.triggerCents, rev.salt, rev.cycleId)).ok).toBe(false);
    expect(checkReveal(rev, mini, commitmentHash(rev.triggerCents, "00".repeat(32), rev.cycleId)).hashOk).toBe(false);
    expect(checkReveal(rev, mini, null).ok).toBe(false);
    const out = { ...rev, triggerCents: 99_999, preimage: commitmentPreimage(99_999, rev.salt, rev.cycleId) };
    expect(checkReveal(out, mini, commitmentHash(99_999, rev.salt, rev.cycleId)).inRange).toBe(false);
    const notCrossed = { ...rev, meterBeforeCents: rev.triggerCents };
    expect(checkReveal(notCrossed, mini, good).crossed).toBe(false);
  });

  it("every revealed cycle over many hits verifies and the hit lands exactly on the committed point", () => {
    const db = freshDb();
    for (let i = 0; i < 30; i++) spinUntilHit(db, "vault-mini", 13);
    const revs = getFairness(db, 20).find((x) => x.tierId === "vault-mini")!.revealed;
    expect(revs).toHaveLength(20);
    for (const r of revs) {
      expect(checkReveal(r, tier("vault-mini"), commitmentHash(r.triggerCents, r.salt, r.cycleId)).ok).toBe(true);
      // hit is the first spin at or over the point: meter before < T <= paid < T + step
      expect(r.hitAmountCents! - r.triggerCents).toBeLessThan(13);
    }
    expect(new Set(revs.map((r) => r.salt)).size).toBe(20);
  });
});

describe("JD2 cycles that predate commitments", () => {
  it("are committed now and flagged midCycle with the meter at commit — never as cycle start", () => {
    const db = new Database(":memory:");
    db.exec(OLD_SCHEMA);
    const now = new Date().toISOString();
    // A pre-JD2 meter: trigger already set, meter part-way up.
    db.prepare("INSERT INTO progressive_meters VALUES ('vault-minor', 9000, 5000, 70, 15000, 12345, NULL, ?)").run(now);
    ensureAllTiers(db);
    const f = getFairness(db).find((x) => x.tierId === "vault-minor")!;
    expect(f.current!.midCycle).toBe(true);
    expect(f.current!.meterAtCommitCents).toBe(9000);
    const c = cycleRow(db, f.current!.cycleId);
    expect(c.trigger_cents).toBe(12345); // the existing point, unchanged
    const copy = fairnessCopy(f).lines.join(" ");
    expect(copy).toMatch(/began before fingerprints were published/);
    expect(copy).toMatch(/\$90/);
    expect(copy).not.toMatch(/at the start of this cycle/);
    // idempotent: further reads never re-commit
    ensureAllTiers(db); ensureAllTiers(db);
    expect(getFairness(db).find((x) => x.tierId === "vault-minor")!.current!.cycleId).toBe(f.current!.cycleId);
    expect((db.prepare("SELECT COUNT(*) n FROM progressive_cycles WHERE tier_id='vault-minor'").get() as { n: number }).n).toBe(1);
    // its reveal says mid-cycle too
    spinUntilHit(db, "vault-minor", 11);
    const rev = getFairness(db).find((x) => x.tierId === "vault-minor")!.revealed[0]!;
    expect(rev.midCycle).toBe(true);
    expect(rev.triggerCents).toBe(12345);
    expect(revealCopy(rev).committed).toMatch(/mid-cycle.*not at the cycle start/);
    expect(getFairness(db).find((x) => x.tierId === "vault-minor")!.current!.midCycle).toBe(false);
  });

  it("Grand has no point and no commitment", () => {
    const db = freshDb();
    const g = getFairness(db).find((x) => x.tierId === "vault-grand")!;
    expect(g.kind).toBe("mystery");
    expect(g.current).toBeNull();
    expect(fairnessCopy(g).lines[0]).toMatch(/no hidden point/);
  });
});

describe("JD2 RTP and odds unchanged", () => {
  it("trigger is still the uniform rollTriggerCents draw on [seed, cap] (mean check)", () => {
    const mini = tier("vault-mini");
    let sum = 0; const n = 20_000;
    for (let i = 0; i < n; i++) { const v = rollTriggerCents(mini)!; expect(v).toBeGreaterThanOrEqual(1000); expect(v).toBeLessThanOrEqual(3000); sum += v; }
    const sd = Math.sqrt((2001 ** 2 - 1) / 12) / Math.sqrt(n);
    expect(Math.abs(sum / n - 2000)).toBeLessThan(5 * sd);
  });

  it("hit rule is unchanged: pays when meter + contribution reaches the committed trigger, award = meter", () => {
    const db = freshDb();
    const id = "vault-major";
    const m = meterRow(db, id);
    const gap = m.trigger_cents - m.amount_cents;
    if (gap > 1) {
      const r1 = applyProgressiveSpin({ contributionByTier: { ...zero(), [id as TierId]: gap - 1 }, betCents: 0 }, db);
      expect(r1.hits).toHaveLength(0);
    }
    const r2 = applyProgressiveSpin({ contributionByTier: { ...zero(), [id as TierId]: 1 }, betCents: 0 }, db);
    expect(r2.hits).toEqual([{ tierId: id, name: "Major", awardCents: m.trigger_cents, reseedsTo: 25_000 }]);
  });

  it("no change to slot math / pot config files", () => {
    const src = readFileSync("src/lib/potFairness.ts", "utf8");
    expect(src).not.toMatch(/randInt|Math\.random/);
    expect(VS_TIERS.map((t) => [t.seedCents, t.ceilingCents, t.contributionBps])).toEqual([[1000, 3000, 100], [5000, 15000, 70], [25000, 100000, 50], [250000, null, 80]]);
  });

  it("copy is neutral (no due/hot/close wording) and the block keeps limits + 1-800-GAMBLER · 21+", () => {
    const db = freshDb();
    for (let i = 0; i < 2; i++) spinUntilHit(db, "vault-mini");
    for (const f of getFairness(db) as FairTier[]) {
      const text = [...fairnessCopy(f).lines, ...f.revealed.flatMap((r) => Object.values(revealCopy(r)))].join(" ");
      expect(text).not.toMatch(BANNED);
    }
    const ui = readFileSync("src/components/PotFairness.tsx", "utf8");
    expect(ui).toMatch(/\/wallet#time/);
    expect(ui).toMatch(/1-800-GAMBLER · 21\+/);
    expect(readFileSync("src/components/PotSheet.tsx", "utf8")).toMatch(/<PotFairness tierId=\{sheet\.tierId\} \/>/);
    expect(readFileSync("src/components/PotSheet.tsx", "utf8")).toMatch(/SandboxChip/);
  });
});
