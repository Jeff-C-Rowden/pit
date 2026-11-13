/**
 * Research #5 slice: Thunderhoof Prairie features resume after a refresh, with live Hold & Spin odds.
 *
 * Honest by construction:
 * - The feature (every respin, coin value and free spin) is still drawn and credited by the server in the
 *   same request as the spin that triggered it. Nothing here draws or changes an outcome.
 * - The server keeps a copy of that settled spin plus how far the player has watched it (`progress`), so a
 *   refresh or a dropped connection picks the round up where it was, instead of losing the replay.
 * - Live odds on the Hold & Spin board are computed only from what is already on screen (coins locked,
 *   respins left, the published 5% per empty spot) with an exact Markov chain. They never peek at the
 *   pre-drawn result.
 * Pure and client-safe: the store that persists this lives in src/lib/featureResumeStore.ts.
 */
import { PR_CELLS, PR_HS_Q_PERMILLE, PR_HS_RESPINS } from "./games/prairie";

export const FEATURE_RESUME_GAME = "prairie-feature";
/** An unwatched feature older than this is closed on the next read (its win was paid long ago). */
export const FEATURE_RESUME_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
/** Free spins save their place every few spins (and at every phase change) to keep writes low. */
export const FS_SAVE_EVERY = 5;

export const RESUME_PHASES = ["intro", "hold", "holdDone", "fsIntro", "fs", "summary"] as const;
export type ResumePhase = (typeof RESUME_PHASES)[number];
export type ResumeProgress = { phase: ResumePhase; step: number };

type Coin = { cell: number; x: number };
export type ResumableSpin = {
  id: string;
  betCents: number;
  winCents: number;
  hold: { start: Coin[]; respins: { landed: Coin[]; respinsLeft: number }[]; board: (number | null)[]; totalX: number; totalWinCents: number; full: boolean } | null;
  freeSpins: { initial: number; spins: { winCents: number }[]; totalWinCents: number; capped: boolean } | null;
};

export const START_PROGRESS: ResumeProgress = { phase: "intro", step: 0 };

const rank = (p: ResumeProgress) => RESUME_PHASES.indexOf(p.phase) * 1000 + p.step;

/** Is `next` at or after `prev`? Late or duplicate saves can never move a round backwards. */
export function isForward(prev: ResumeProgress, next: ResumeProgress): boolean {
  return rank(next) >= rank(prev);
}

/** Validate a client-sent progress against the settled spin; null when it can't belong to this spin. */
export function sanitizeProgress(spin: ResumableSpin, raw: unknown): ResumeProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { phase?: unknown; step?: unknown };
  const phase = RESUME_PHASES.find((p) => p === r.phase);
  const step = typeof r.step === "number" && Number.isInteger(r.step) ? r.step : NaN;
  if (!phase || !(step >= 0)) return null;
  const hold = spin.hold, fs = spin.freeSpins;
  switch (phase) {
    case "intro": case "holdDone": case "fsIntro": case "summary":
      if (step !== 0) return null;
      if ((phase === "holdDone") && !hold) return null;
      if (phase === "fsIntro" && !(hold && fs)) return null;
      if (phase === "intro" && !hold && !fs) return null;
      return { phase, step };
    case "hold":
      return hold && step <= hold.respins.length ? { phase, step } : null;
    case "fs":
      return fs && step < fs.spins.length ? { phase, step } : null;
  }
}

/** Free-spin win already shown before free spin `idx` (0-based) starts. */
export function fsWonBefore(spin: ResumableSpin, idx: number): number {
  return (spin.freeSpins?.spins ?? []).slice(0, Math.max(0, idx)).reduce((a, s) => a + s.winCents, 0);
}

/** Board after `step` respins have been shown. */
export function holdBoardAt(hold: NonNullable<ResumableSpin["hold"]>, step: number) {
  const board: (number | null)[] = Array(PR_CELLS).fill(null);
  for (const c of hold.start) board[c.cell] = c.x;
  const n = Math.max(0, Math.min(step, hold.respins.length));
  hold.respins.slice(0, n).forEach((r) => r.landed.forEach((c) => { board[c.cell] = c.x; }));
  const left = n === 0 ? PR_HS_RESPINS : hold.respins[n - 1]!.respinsLeft;
  const coins = board.filter((v) => v != null).length;
  const totalX = board.reduce<number>((a, v) => a + (v ?? 0), 0);
  return { board, left, coins, totalX };
}

function binom(n: number, k: number, p: number) {
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c * p ** k * (1 - p) ** (n - k);
}

const lawMemo = new Map<string, number[]>();
/** Exact distribution of the final coin count from `coins` locked with `left` respins to go. */
export function holdLawFrom(coins: number, left: number, q = PR_HS_Q_PERMILLE / 1000, cells = PR_CELLS, reset = PR_HS_RESPINS): number[] {
  const key = `${coins}|${left}|${q}|${cells}|${reset}`;
  const hit = lawMemo.get(key);
  if (hit) return hit;
  let out: number[];
  if (coins >= cells || left <= 0) { out = Array(cells + 1).fill(0); out[Math.min(coins, cells)] = 1; }
  else {
    out = Array(cells + 1).fill(0);
    const empty = cells - coins;
    for (let k = 0; k <= empty; k++) {
      const p = binom(empty, k, q);
      const sub = k ? holdLawFrom(coins + k, reset, q, cells, reset) : holdLawFrom(coins, left - 1, q, cells, reset);
      sub.forEach((v, i) => { out[i] += p * v; });
    }
  }
  lawMemo.set(key, out);
  return out;
}

export type HoldOdds = {
  /** Chance the next respin lands at least one coin (0 when the round is over). */
  nextCoin: number;
  /** Chance the round ends with a full 15-coin screen, from here. */
  fullScreen: number;
  /** Expected coins on the board when the round ends, from here. */
  expectedCoins: number;
};

/** Live odds from the visible board only (coins locked, respins left). */
export function holdOdds(coins: number, left: number, q = PR_HS_Q_PERMILLE / 1000, cells = PR_CELLS): HoldOdds {
  const over = left <= 0 || coins >= cells;
  const law = holdLawFrom(coins, left, q, cells);
  return {
    nextCoin: over ? 0 : 1 - (1 - q) ** (cells - coins),
    fullScreen: law[cells] ?? 0,
    expectedCoins: law.reduce((a, p, i) => a + p * i, 0),
  };
}

/** "54%", "0.2%", "<0.1%", "100%". */
export function pctText(p: number): string {
  if (!(p > 0)) return "0%";
  if (p >= 1) return "100%";
  const v = p * 100;
  if (v < 0.1) return "<0.1%";
  if (v < 10) return `${(Math.round(v * 10) / 10).toFixed(1)}%`;
  return `${Math.round(v)}%`;
}

/** Where a resumed round picks up, in words for the welcome-back card. */
export function resumeWhere(spin: ResumableSpin, p: ResumeProgress): string {
  switch (p.phase) {
    case "intro": case "fsIntro": return "the start; nothing has played yet.";
    case "hold": {
      const b = spin.hold ? holdBoardAt(spin.hold, p.step) : null;
      return b ? `${p.step === 0 ? "the first respin" : `respin ${p.step + 1}`}, with ${b.coins} coins locked and ${b.left} respin${b.left === 1 ? "" : "s"} left.` : "the next respin.";
    }
    case "holdDone": return "the round-up total; every respin has played.";
    case "fs": return `free spin ${p.step + 1} of ${spin.freeSpins?.spins.length ?? 0}.`;
    case "summary": return "the feature total; every part has played.";
  }
}

export const RESUME_NOTE = "This round was drawn and paid when you spun. We saved your place on the server, so the rest plays out exactly as drawn. Refreshing never changes a result.";
