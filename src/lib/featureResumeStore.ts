/**
 * Server-side store for resumable slot features (research #5). Uses the existing game_states table: one row
 * per feature spin, status 'open' until the player collects. The row holds the already-settled public spin and
 * how far the player has watched it. It never holds money: the spin's win was credited to the ledger in the
 * same transaction as the bet. Slice 1 served Thunderhoof Prairie; slice 2 adds Canary Creek Mine and Kettle
 * of Clover through the same code, each under its own game key so one cabinet never closes another's round.
 */
import type Database from "better-sqlite3";
import { getDb } from "./db";
import { loadOpenGame, saveGame } from "./ledger";
import {
  FEATURE_RESUME_MAX_AGE_MS, PRAIRIE_RESUME, isForwardIn,
  type AnyProgress, type ResumableSpin, type ResumeKind, type ResumeProgress,
} from "./featureResume";

export type ResumeState<S extends { id: string } = ResumableSpin, P extends AnyProgress = ResumeProgress> = { spin: S; progress: P; openedAt: string };

export function featureStore<S extends { id: string }, P extends AnyProgress>(kind: ResumeKind<S, P>) {
  const closeAllOpen = (userId: string, db: Database.Database) => {
    db.prepare("UPDATE game_states SET status = 'settled', updated_at = ? WHERE user_id = ? AND game = ? AND status = 'open'")
      .run(new Date().toISOString(), userId, kind.game);
  };
  return {
    /** Called in the spin transaction: any older open round is closed (it was paid already), then this one is saved. */
    openFeature<T extends S>(userId: string, spin: T, db: Database.Database = getDb(), now = new Date()) {
      closeAllOpen(userId, db);
      const state: ResumeState<T, P> = { spin, progress: { ...kind.start }, openedAt: now.toISOString() };
      saveGame({ id: `${kind.idPrefix}-${spin.id}`, userId, game: kind.game, status: "open", state }, db);
    },
    /** A new spin with no feature still closes a stale round so it can't pop up later. */
    closeOpenFeatures(userId: string, db: Database.Database = getDb()) {
      closeAllOpen(userId, db);
    },
    loadOpenFeature<T extends S = S>(userId: string, db: Database.Database = getDb(), now = Date.now()): ResumeState<T, P> | null {
      const row = loadOpenGame<ResumeState<T, P>>(userId, kind.game, db);
      if (!row) return null;
      const age = now - Date.parse(row.state.openedAt);
      if (!(age >= 0 && age <= FEATURE_RESUME_MAX_AGE_MS)) { closeAllOpen(userId, db); return null; }
      return row.state;
    },
    /** Save how far the player has watched. Ignores unknown spins, bad input and backwards moves. */
    saveProgress(userId: string, spinId: string, raw: unknown, db: Database.Database = getDb()): P | null {
      const row = loadOpenGame<ResumeState<S, P>>(userId, kind.game, db);
      if (!row || row.state.spin.id !== spinId) return null;
      const next = kind.sanitize(row.state.spin, raw);
      if (!next) return null;
      const prev = row.state.progress;
      if (!isForwardIn(kind.phases, prev, next)) return prev;
      if (next.phase === prev.phase && next.step === prev.step) return prev;
      saveGame({ id: row.id, userId, game: kind.game, status: "open", state: { ...row.state, progress: next } }, db);
      return next;
    },
    /** Collect: the round is finished and won't resume again. */
    collectFeature(userId: string, spinId: string, db: Database.Database = getDb()): boolean {
      const row = loadOpenGame<ResumeState<S, P>>(userId, kind.game, db);
      if (!row || row.state.spin.id !== spinId) return false;
      saveGame({ id: row.id, userId, game: kind.game, status: "settled", state: { ...row.state, progress: { phase: "summary", step: 0 } } }, db);
      return true;
    },
  };
}

// Thunderhoof Prairie (slice 1) keeps its original exports.
const prairie = featureStore(PRAIRIE_RESUME);
export const openFeature = prairie.openFeature;
export const closeOpenFeatures = prairie.closeOpenFeatures;
export function loadOpenFeature<S extends ResumableSpin = ResumableSpin>(userId: string, db: Database.Database = getDb(), now = Date.now()): ResumeState<S> | null {
  return prairie.loadOpenFeature<S>(userId, db, now);
}
export const saveProgress = prairie.saveProgress;
export const collectFeature = prairie.collectFeature;
