import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
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
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  game TEXT,
  ref TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  meta TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_ref ON ledger(ref);
CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS game_states (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  game TEXT NOT NULL,
  status TEXT NOT NULL,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_games_user ON game_states(user_id, game, status);
CREATE TABLE IF NOT EXISTS progressive_meters (
  id TEXT PRIMARY KEY,
  amount_cents INTEGER NOT NULL,
  seed_cents INTEGER NOT NULL,
  contribution_bps INTEGER NOT NULL,
  ceiling_cents INTEGER,
  trigger_cents INTEGER,
  last_hit_at TEXT,
  updated_at TEXT NOT NULL
);
`;

let singleton: Database.Database | null = null;
let dirty = false;

/** True when a write ran since the last clearDirty(). Used by the Blob snapshot sync. */
export function isDirty(): boolean { return dirty; }
export function clearDirty(): void { dirty = false; }

function instrument(db: Database.Database): Database.Database {
  const prepare = db.prepare.bind(db);
  (db as unknown as { prepare: unknown }).prepare = (sql: string) => {
    const stmt = prepare(sql);
    if (!/^\s*(select|pragma)\b/i.test(sql)) {
      const run = stmt.run.bind(stmt);
      (stmt as unknown as { run: unknown }).run = (...args: unknown[]) => {
        dirty = true;
        return (run as (...a: unknown[]) => Database.RunResult)(...args);
      };
    }
    return stmt;
  };
  return db;
}

function finish(db: Database.Database, wal: boolean): Database.Database {
  if (wal) db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return instrument(db);
}

/** Replace the in-process DB with one loaded from a serialized SQLite image (or a fresh one). */
export function loadDbFromImage(image: Buffer | null): Database.Database {
  if (singleton) {
    try { singleton.close(); } catch { /* ignore */ }
  }
  singleton = finish(image ? new Database(image) : new Database(":memory:"), false);
  dirty = false;
  return singleton;
}

export function serializeDb(): Buffer {
  return getDb().serialize();
}

export function getDb(): Database.Database {
  if (singleton) return singleton;
  if (process.env.BLOB_READ_WRITE_TOKEN && !process.env.PIT_DB_PATH) {
    // Vercel: in-memory DB, snapshotted to Vercel Blob by withDbSync().
    return loadDbFromImage(null);
  }
  const dbPath = process.env.PIT_DB_PATH || path.join(process.cwd(), "data", "pit.sqlite");
  if (dbPath !== ":memory:") {
    try {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`unable to create database directory for PIT_DB_PATH=${dbPath}: ${msg}`);
    }
  }
  let db: Database.Database;
  try {
    db = new Database(dbPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `unable to open database file at PIT_DB_PATH=${dbPath} (ensure the directory is writable by the app user): ${msg}`
    );
  }
  singleton = finish(db, true);
  return singleton;
}

export function resetDbForTests(dbPath = ":memory:"): Database.Database {
  if (singleton) {
    try { singleton.close(); } catch { /* ignore */ }
  }
  singleton = null;
  process.env.PIT_DB_PATH = dbPath;
  return getDb();
}

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  age_confirmed: number;
  is_operator: number;
  balance_cents: number;
  deposit_limit_cents: number | null;
  loss_limit_cents: number | null;
  created_at: string;
};

export type LedgerRow = {
  id: string;
  user_id: string;
  type: string;
  amount_cents: number;
  balance_after_cents: number;
  game: string | null;
  ref: string | null;
  idempotency_key: string;
  meta: string | null;
  created_at: string;
};

export type GameStateRow = {
  id: string;
  user_id: string;
  game: string;
  status: string;
  state_json: string;
  created_at: string;
  updated_at: string;
};
