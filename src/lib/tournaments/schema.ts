import type Database from "better-sqlite3";

export function migrateTournaments(db: Database.Database) {
  db.exec(`
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  format TEXT NOT NULL,
  category TEXT NOT NULL,
  game TEXT NOT NULL,
  rank_mode TEXT NOT NULL CHECK (rank_mode IN ('balance','accumulated')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  reg_closes_at TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  buyin_cents INTEGER NOT NULL,
  fee_bps INTEGER NOT NULL,
  house_seed_cents INTEGER NOT NULL DEFAULT 0,
  prize_type TEXT NOT NULL CHECK (prize_type IN ('cash','bonus')),
  start_stack_cents INTEGER NOT NULL,
  min_bet_cents INTEGER NOT NULL,
  max_bet_cents INTEGER NOT NULL,
  min_qualifying_bets INTEGER NOT NULL,
  rebuy_fee_cents INTEGER,
  rebuy_stack_cents INTEGER,
  rebuy_max_balance_cents INTEGER,
  rebuy_limit INTEGER NOT NULL DEFAULT 0,
  chicago_day TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled','live','finished')),
  seed TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finalized_at TEXT,
  UNIQUE (template_id, starts_at)
);
CREATE INDEX IF NOT EXISTS idx_tny_status_end ON tournaments(status, ends_at);
CREATE INDEX IF NOT EXISTS idx_tny_start ON tournaments(starts_at);
CREATE TABLE IF NOT EXISTS tournament_entries (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  display_name TEXT NOT NULL,
  stack_cents INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  score_reached_at TEXT,
  bets_made INTEGER NOT NULL DEFAULT 0,
  wagered_cents INTEGER NOT NULL DEFAULT 0,
  best_round_points INTEGER NOT NULL DEFAULT 0,
  rebuys INTEGER NOT NULL DEFAULT 0,
  last_round_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('registered','withdrawn','paid','unplaced')),
  final_rank INTEGER,
  prize_cents INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE (tournament_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tne_t ON tournament_entries(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tne_user ON tournament_entries(user_id, created_at);
CREATE TABLE IF NOT EXISTS tournament_rounds (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES tournament_entries(id),
  game TEXT NOT NULL,
  stake_cents INTEGER NOT NULL,
  return_cents INTEGER NOT NULL,
  points INTEGER NOT NULL,
  stack_after_cents INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  summary TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tnr_entry ON tournament_rounds(entry_id, created_at);
CREATE TABLE IF NOT EXISTS tournament_house_book (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('fee','fee_refund','freeroll_seed','seed_unspent')),
  amount_cents INTEGER NOT NULL,
  chicago_day TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_thb_day ON tournament_house_book(chicago_day, kind);
`);
  const tc = new Set((db.prepare("PRAGMA table_info(tournaments)").all() as { name: string }[]).map((c) => c.name));
  if (!tc.has("fixed_plays")) db.exec("ALTER TABLE tournaments ADD COLUMN fixed_plays INTEGER");
  const ec = new Set((db.prepare("PRAGMA table_info(tournament_entries)").all() as { name: string }[]).map((c) => c.name));
  if (!ec.has("plays_used")) db.exec("ALTER TABLE tournament_entries ADD COLUMN plays_used INTEGER NOT NULL DEFAULT 0");
}

export type TournamentRow = {
  id: string; template_id: string; name: string; format: string; category: "slots" | "tables"; game: string;
  rank_mode: "balance" | "accumulated"; starts_at: string; ends_at: string; reg_closes_at: string; duration_min: number;
  buyin_cents: number; fee_bps: number; house_seed_cents: number; prize_type: "cash" | "bonus"; start_stack_cents: number;
  min_bet_cents: number; max_bet_cents: number; min_qualifying_bets: number; rebuy_fee_cents: number | null;
  rebuy_stack_cents: number | null; rebuy_max_balance_cents: number | null; rebuy_limit: number; chicago_day: string;
  status: "scheduled" | "live" | "finished"; seed: string; created_at: string; finalized_at: string | null; fixed_plays: number | null;
};

export type EntryRow = {
  id: string; tournament_id: string; user_id: string; display_name: string; stack_cents: number; score: number;
  score_reached_at: string | null; bets_made: number; wagered_cents: number; best_round_points: number; rebuys: number;
  last_round_at: string | null; status: "registered" | "withdrawn" | "paid" | "unplaced"; final_rank: number | null;
  prize_cents: number | null; created_at: string; plays_used: number;
};
