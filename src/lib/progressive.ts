import type Database from "better-sqlite3";
import { getDb } from "./db";
import { randInt } from "./rng";
import { VS_TIERS, type TierDef, type TierId } from "./games/slotProgressive";

export type ProgressiveRow = {
  id: string;
  amount_cents: number;
  seed_cents: number;
  contribution_bps: number;
  ceiling_cents: number | null;
  trigger_cents: number | null;
  last_hit_at: string | null;
  updated_at: string;
};

function tierById(id: string): TierDef {
  const t = VS_TIERS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown progressive tier ${id}`);
  return t;
}

/** Hidden must-hit trigger uniformly in [seed, ceiling]. Grand has no trigger. */
export function rollTriggerCents(tier: TierDef): number | null {
  if (tier.ceilingCents == null) return null;
  const lo = tier.seedCents;
  const hi = tier.ceilingCents;
  if (hi <= lo) return hi;
  return lo + randInt(hi - lo + 1);
}

function migrateColumns(db: Database.Database) {
  const cols = db.prepare("PRAGMA table_info(progressive_meters)").all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("ceiling_cents")) {
    db.exec("ALTER TABLE progressive_meters ADD COLUMN ceiling_cents INTEGER");
  }
  if (!names.has("trigger_cents")) {
    db.exec("ALTER TABLE progressive_meters ADD COLUMN trigger_cents INTEGER");
  }
}

export function ensureAllTiers(db: Database.Database = getDb()): ProgressiveRow[] {
  migrateColumns(db);
  const now = new Date().toISOString();
  for (const t of VS_TIERS) {
    const existing = db.prepare("SELECT * FROM progressive_meters WHERE id = ?").get(t.id) as ProgressiveRow | undefined;
    if (!existing) {
      const trigger = rollTriggerCents(t);
      db.prepare(
        `INSERT INTO progressive_meters
          (id, amount_cents, seed_cents, contribution_bps, ceiling_cents, trigger_cents, last_hit_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      ).run(t.id, t.seedCents, t.seedCents, t.contributionBps, t.ceilingCents, trigger, now);
    } else {
      // Keep live amount; refresh config columns if defs changed.
      let trigger = existing.trigger_cents;
      if (t.ceilingCents != null && (trigger == null || trigger < t.seedCents || trigger > t.ceilingCents)) {
        trigger = rollTriggerCents(t);
      }
      if (t.ceilingCents == null) trigger = null;
      db.prepare(
        `UPDATE progressive_meters
         SET seed_cents = ?, contribution_bps = ?, ceiling_cents = ?, trigger_cents = ?
         WHERE id = ?`,
      ).run(t.seedCents, t.contributionBps, t.ceilingCents, trigger, t.id);
    }
  }
  return VS_TIERS.map((t) => db.prepare("SELECT * FROM progressive_meters WHERE id = ?").get(t.id) as ProgressiveRow);
}

/**
 * Ambient peer drip so meters climb while idle.
 * Caps just below trigger for MHB tiers (hits resolve only on contributing spins).
 * ~1–3¢ every ~2s across the family, weighted by bps.
 */
export function applyPeerDrip(db: Database.Database = getDb()): ProgressiveRow[] {
  const rows = ensureAllTiers(db);
  const now = Date.now();
  const oldest = Math.min(...rows.map((r) => Date.parse(r.updated_at) || now));
  const elapsedMs = Math.max(0, now - oldest);
  const ticks = Math.min(30, Math.floor(elapsedMs / 2000)); // max 30 ticks per call
  if (ticks <= 0) return rows;

  const nowIso = new Date().toISOString();
  const totalBps = VS_TIERS.reduce((a, t) => a + t.contributionBps, 0);
  for (const t of VS_TIERS) {
    const row = rows.find((r) => r.id === t.id)!;
    const share = Math.max(1, Math.round((ticks * 2 * t.contributionBps) / totalBps));
    let next = row.amount_cents + share;
    if (row.trigger_cents != null) {
      next = Math.min(next, row.trigger_cents - 1);
    }
    if (next < row.amount_cents) next = row.amount_cents;
    db.prepare(`UPDATE progressive_meters SET amount_cents = ?, updated_at = ? WHERE id = ?`).run(next, nowIso, t.id);
  }
  return VS_TIERS.map((t) => db.prepare("SELECT * FROM progressive_meters WHERE id = ?").get(t.id) as ProgressiveRow);
}

export function getAllProgressives(db: Database.Database = getDb()): ProgressiveRow[] {
  return applyPeerDrip(db);
}

export type TierHit = {
  tierId: TierId;
  name: string;
  awardCents: number;
  reseedsTo: number;
};

export type ProgressiveSpinResult = {
  contributionByTier: Record<TierId, number>;
  hits: TierHit[];
  progressiveAwardCents: number;
  metersAfter: ProgressiveRow[];
};

/**
 * Apply per-tier contributions, then evaluate MHB / Grand mystery on this spin.
 * On hit: award displayed (post-contribution) amount, reseed, roll new trigger.
 */
export function applyProgressiveSpin(
  opts: { contributionByTier: Record<TierId, number> },
  db: Database.Database = getDb(),
): ProgressiveSpinResult {
  ensureAllTiers(db);
  const now = new Date().toISOString();
  const hits: TierHit[] = [];

  for (const t of VS_TIERS) {
    const contrib = Math.max(0, Math.floor(opts.contributionByTier[t.id] ?? 0));
    const row = db.prepare("SELECT * FROM progressive_meters WHERE id = ?").get(t.id) as ProgressiveRow;
    const afterContrib = row.amount_cents + contrib;

    let hit = false;
    if (t.ceilingCents != null && row.trigger_cents != null && afterContrib >= row.trigger_cents) {
      hit = true;
    } else if (t.mysteryOddsPerSpin != null && t.mysteryOddsPerSpin > 0) {
      // Mystery roll after contribution (qualifying spin).
      if (randInt(t.mysteryOddsPerSpin) === 0) hit = true;
    }

    if (hit) {
      const award = afterContrib;
      const newTrigger = rollTriggerCents(t);
      db.prepare(
        `UPDATE progressive_meters
         SET amount_cents = ?, trigger_cents = ?, last_hit_at = ?, updated_at = ?
         WHERE id = ?`,
      ).run(t.seedCents, newTrigger, now, now, t.id);
      hits.push({ tierId: t.id, name: t.name, awardCents: award, reseedsTo: t.seedCents });
    } else {
      db.prepare(
        `UPDATE progressive_meters SET amount_cents = ?, updated_at = ? WHERE id = ?`,
      ).run(afterContrib, now, t.id);
    }
  }

  const metersAfter = VS_TIERS.map((t) => db.prepare("SELECT * FROM progressive_meters WHERE id = ?").get(t.id) as ProgressiveRow);
  return {
    contributionByTier: opts.contributionByTier,
    hits,
    progressiveAwardCents: hits.reduce((a, h) => a + h.awardCents, 0),
    metersAfter,
  };
}

export function publicMeters(rows: ProgressiveRow[]) {
  return rows.map((row) => {
    const def = tierById(row.id);
    return {
      id: row.id as TierId,
      name: def.name,
      progressiveCents: row.amount_cents,
      seedCents: row.seed_cents,
      ceilingCents: row.ceiling_cents,
      contributionBps: row.contribution_bps,
      // Never expose hidden trigger to clients.
      lastHitAt: row.last_hit_at,
      updatedAt: row.updated_at,
      hasMustHitBy: row.ceiling_cents != null,
    };
  });
}
