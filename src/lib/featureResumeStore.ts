/**
 * Server-side store for resumable Thunderhoof Prairie features (research #5 slice). Uses the existing
 * game_states table: one row per feature spin, status 'open' until the player collects. The row holds the
 * already-settled public spin and how far the player has watched it. It never holds money: the spin's win
 * was credited to the ledger in the same transaction as the bet.
 */
import type Database from "better-sqlite3";
import { getDb } from "./db";
import { loadOpenGame, saveGame } from "./ledger";
import {
  FEATURE_RESUME_GAME, FEATURE_RESUME_MAX_AGE_MS, START_PROGRESS, isForward, sanitizeProgress,
  type ResumableSpin, type ResumeProgress,
} from "./featureResume";

export type ResumeState<S extends ResumableSpin = ResumableSpin> = { spin: S; progress: ResumeProgress; openedAt: string };

function closeAllOpen(userId: string, db: Database.Database) {
  db.prepare("UPDATE game_states SET status = 'settled', updated_at = ? WHERE user_id = ? AND game = ? AND status = 'open'")
    .run(new Date().toISOString(), userId, FEATURE_RESUME_GAME);
}

/** Called in the spin transaction: any older open round is closed (it was paid already), then this one is saved. */
export function openFeature<S extends ResumableSpin>(userId: string, spin: S, db: Database.Database = getDb(), now = new Date()) {
  closeAllOpen(userId, db);
  const state: ResumeState<S> = { spin, progress: { ...START_PROGRESS }, openedAt: now.toISOString() };
  saveGame({ id: `prf-${spin.id}`, userId, game: FEATURE_RESUME_GAME, status: "open", state }, db);
}

/** A new spin with no feature still closes a stale round so it can't pop up later. */
export function closeOpenFeatures(userId: string, db: Database.Database = getDb()) {
  closeAllOpen(userId, db);
}

export function loadOpenFeature<S extends ResumableSpin>(userId: string, db: Database.Database = getDb(), now = Date.now()): ResumeState<S> | null {
  const row = loadOpenGame<ResumeState<S>>(userId, FEATURE_RESUME_GAME, db);
  if (!row) return null;
  const age = now - Date.parse(row.state.openedAt);
  if (!(age >= 0 && age <= FEATURE_RESUME_MAX_AGE_MS)) { closeAllOpen(userId, db); return null; }
  return row.state;
}

/** Save how far the player has watched. Ignores unknown spins, bad input and backwards moves. */
export function saveProgress(userId: string, spinId: string, raw: unknown, db: Database.Database = getDb()): ResumeProgress | null {
  const row = loadOpenGame<ResumeState>(userId, FEATURE_RESUME_GAME, db);
  if (!row || row.state.spin.id !== spinId) return null;
  const next = sanitizeProgress(row.state.spin, raw);
  if (!next) return null;
  if (!isForward(row.state.progress, next)) return row.state.progress;
  if (next.phase === row.state.progress.phase && next.step === row.state.progress.step) return next;
  saveGame({ id: row.id, userId, game: FEATURE_RESUME_GAME, status: "open", state: { ...row.state, progress: next } }, db);
  return next;
}

/** Collect: the round is finished and won't resume again. */
export function collectFeature(userId: string, spinId: string, db: Database.Database = getDb()): boolean {
  const row = loadOpenGame<ResumeState>(userId, FEATURE_RESUME_GAME, db);
  if (!row || row.state.spin.id !== spinId) return false;
  saveGame({ id: row.id, userId, game: FEATURE_RESUME_GAME, status: "settled", state: { ...row.state, progress: { phase: "summary", step: 0 } } }, db);
  return true;
}
