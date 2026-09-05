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
`;

let singleton: Database.Database | null = null;

export function getDb(): Database.Database {
  if (singleton) return singleton;
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
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  singleton = db;
  return db;
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
