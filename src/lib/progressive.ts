import type Database from "better-sqlite3";
import { getDb } from "./db";
import { newId, randInt } from "./rng";
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

export type ProgressiveHitRow = {
  id: string;
  tier_id: string;
  tier_name: string;
  amount_cents: number;
  user_id: string | null;
  created_at: string;
};

export type RecentHitPublic = {
  tier: string;
  tierId: TierId;
  amountCents: number;
  at: string;
  displayName: string;
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

/** Ensure progressive_hits exists (for DBs opened before the table was added to SCHEMA). */
export function ensureHitsTable(db: Database.Database = getDb()) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS progressive_hits (
      id TEXT PRIMARY KEY,
      tier_id TEXT NOT NULL,
      tier_name TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      user_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_progressive_hits_at ON progressive_hits(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_progressive_hits_tier_at ON progressive_hits(tier_id, created_at DESC);
  `);
}

/** Privacy-safe winner label from a real account display name (never invented). */
export function privacyDisplayName(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return "Player";
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 16);
  const first = parts[0]!.slice(0, 14);
  const initial = parts[parts.length - 1]![0]!;
  return `${first} ${initial}.`.slice(0, 18);
}

export function ensureAllTiers(db: Database.Database = getDb()): ProgressiveRow[] {
  migrateColumns(db);
  ensureHitsTable(db);
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
 * On hit: award displayed (post-contribution) amount, reseed, roll new trigger,
 * and append a genuine progressive_hits row (never invented).
 */
export function applyProgressiveSpin(
  opts: { contributionByTier: Record<TierId, number>; userId?: string | null },
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
      db.prepare(
        `INSERT INTO progressive_hits (id, tier_id, tier_name, amount_cents, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(newId(), t.id, t.name, award, opts.userId ?? null, now);
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

const RECENT_HITS_DEFAULT = 8;

/**
 * Genuine past progressive wins only — empty when nobody has hit yet.
 * Joins users for a privacy-safe display name when user_id is present.
 */
export function getRecentProgressiveHits(
  db: Database.Database = getDb(),
  limit = RECENT_HITS_DEFAULT,
): RecentHitPublic[] {
  ensureHitsTable(db);
  const cap = Math.max(0, Math.min(20, Math.floor(limit)));
  if (cap === 0) return [];

  const rows = db
    .prepare(
      `SELECT tier_id, tier_name, amount_cents, user_id, created_at
       FROM progressive_hits
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(cap) as ProgressiveHitRow[];

  return toPublicHits(db, rows);
}

function toPublicHits(db: Database.Database, rows: ProgressiveHitRow[]): RecentHitPublic[] {
  const hasUsers = Boolean(
    db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'users'").get(),
  );
  const nameById = new Map<string, string>();
  if (hasUsers) {
    const lookup = db.prepare("SELECT display_name FROM users WHERE id = ?");
    for (const r of rows) {
      if (!r.user_id || nameById.has(r.user_id)) continue;
      const u = lookup.get(r.user_id) as { display_name: string } | undefined;
      if (u?.display_name) nameById.set(r.user_id, u.display_name);
    }
  }

  return rows.map((r) => ({
    tier: r.tier_name,
    tierId: r.tier_id as TierId,
    amountCents: r.amount_cents,
    at: r.created_at,
    displayName: privacyDisplayName(r.user_id ? nameById.get(r.user_id) : null),
  }));
}

export const HIT_HISTORY_PER_TIER_MAX = 10;

/**
 * J3: last N genuine hits for EACH tier (Mini / Minor / Major / Grand), newest
 * first, from progressive_hits. The amount is the meter at the hit. Same
 * privacy-safe names as recentHits; empty arrays when a tier never hit.
 */
export function getHitHistoryByTier(
  db: Database.Database = getDb(),
  perTier = HIT_HISTORY_PER_TIER_MAX,
): RecentHitPublic[] {
  ensureHitsTable(db);
  const cap = Math.max(0, Math.min(HIT_HISTORY_PER_TIER_MAX, Math.floor(perTier)));
  if (cap === 0) return [];
  const stmt = db.prepare(
    `SELECT tier_id, tier_name, amount_cents, user_id, created_at
     FROM progressive_hits
     WHERE tier_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
  );
  const rows: ProgressiveHitRow[] = [];
  for (const t of VS_TIERS) rows.push(...(stmt.all(t.id, cap) as ProgressiveHitRow[]));
  return toPublicHits(db, rows);
}
