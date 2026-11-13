/**
 * Research #5 slice 2: Canary Creek Mine (Mine Cart pick + free spins) and Kettle of Clover (Rainbow Wheel +
 * free spins) resume after a refresh, exactly like Thunderhoof Prairie (slice 1).
 *
 * Honest by construction: every cart, wheel wedge and free spin is drawn and credited by the server in the
 * spin request that triggered it. These helpers only describe and validate how far the player has watched
 * that settled spin. Nothing here draws, changes or pays anything. Pure and client-safe.
 */
import { MINE_PICK_CARTS } from "./games/mine";
import type { ResumeKind } from "./featureResume";

type Spins = { spins: { winCents: number }[] } | null | undefined;

/** Win already shown in a free-spin block before spin `idx` (0-based) starts. */
export function wonBefore(fs: Spins, idx: number): number {
  return (fs?.spins ?? []).slice(0, Math.max(0, idx)).reduce((a, s) => a + s.winCents, 0);
}

const isStep = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

// ------------------------------------------------------------------ Canary Creek Mine

export const MINE_RESUME_GAME = "mine-feature";
export const MINE_RESUME_PHASES = ["intro", "pick", "fsIntro", "fs", "summary"] as const;
export type MineResumePhase = (typeof MINE_RESUME_PHASES)[number];
/** `picked` lists the carts opened so far, in order, so a resumed pick board looks exactly as it did. */
export type MineProgress = { phase: MineResumePhase; step: number; picked?: number[] };
export type MineResumable = {
  id: string; betCents: number; winCents: number;
  pick: { reveals: ({ kind: "prize"; x: number } | { kind: "collect" })[]; totalX: number; totalWinCents: number } | null;
  freeSpins: { spins: { winCents: number }[]; totalWinCents: number } | null;
};

export function sanitizeMineProgress(spin: MineResumable, raw: unknown): MineProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { phase?: unknown; step?: unknown; picked?: unknown };
  const phase = MINE_RESUME_PHASES.find((p) => p === r.phase);
  if (!phase || !isStep(r.step)) return null;
  const step = r.step, pk = spin.pick, fs = spin.freeSpins;
  switch (phase) {
    case "intro": return step === 0 && (pk || fs) ? { phase, step } : null;
    case "fsIntro": return step === 0 && pk && fs ? { phase, step } : null;
    case "summary": return step === 0 ? { phase, step } : null;
    case "fs": return fs && step < fs.spins.length ? { phase, step } : null;
    case "pick": {
      if (!pk || step > pk.reveals.length) return null;
      if (r.picked === undefined) return { phase, step };
      const c = r.picked;
      if (!Array.isArray(c) || c.length !== step || !c.every((x) => isStep(x) && x < MINE_PICK_CARTS) || new Set(c).size !== c.length) return null;
      return { phase, step, picked: [...c] as number[] };
    }
  }
}

export const MINE_RESUME: ResumeKind<MineResumable, MineProgress> = {
  game: MINE_RESUME_GAME, idPrefix: "mnf", phases: MINE_RESUME_PHASES, start: { phase: "intro", step: 0 }, sanitize: sanitizeMineProgress,
};

/** Carts to show as already open on a resumed pick board (falls back to the first N carts if positions weren't saved). */
export function minePickedCarts(p: MineProgress): number[] {
  if (p.phase !== "pick") return [];
  return p.picked && p.picked.length === p.step ? p.picked : Array.from({ length: p.step }, (_, i) => i);
}

export function mineResumeWhere(spin: MineResumable, p: MineProgress): string {
  switch (p.phase) {
    case "intro": return "the start; nothing has played yet.";
    case "pick": {
      if (p.step === 0) return "the Mine Cart pick; no carts opened yet.";
      const x = (spin.pick?.reveals ?? []).slice(0, p.step).reduce((a, it) => a + (it.kind === "prize" ? it.x : 0), 0);
      return `the Mine Cart pick, with ${p.step} cart${p.step === 1 ? "" : "s"} opened and ${x}× bet found so far.`;
    }
    case "fsIntro": return "the free spins; the Mine Cart pick is done.";
    case "fs": return `free spin ${p.step + 1} of ${spin.freeSpins?.spins.length ?? 0}.`;
    case "summary": return "the feature total; every part has played.";
  }
}

// ------------------------------------------------------------------ Kettle of Clover

export const CLOVER_RESUME_GAME = "clover-feature";
/** The Rainbow Wheel's own ready screen is the intro, so a wheel round that hasn't moved on is still "intro". */
export const CLOVER_RESUME_PHASES = ["intro", "wheelFs", "kettleIntro", "kettleFs", "summary"] as const;
export type CloverResumePhase = (typeof CLOVER_RESUME_PHASES)[number];
export type CloverProgress = { phase: CloverResumePhase; step: number };
export type CloverResumable = {
  id: string; betCents: number; winCents: number;
  wheel: { freeSpins: { spins: { winCents: number }[] } | null } | null;
  freeSpins: { spins: { winCents: number }[] } | null;
};

export function sanitizeCloverProgress(spin: CloverResumable, raw: unknown): CloverProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { phase?: unknown; step?: unknown };
  const phase = CLOVER_RESUME_PHASES.find((p) => p === r.phase);
  if (!phase || !isStep(r.step)) return null;
  const step = r.step, wfs = spin.wheel?.freeSpins, kfs = spin.freeSpins;
  switch (phase) {
    case "intro": return step === 0 && (spin.wheel || kfs) ? { phase, step } : null;
    case "kettleIntro": return step === 0 && spin.wheel && kfs ? { phase, step } : null;
    case "summary": return step === 0 ? { phase, step } : null;
    case "wheelFs": return wfs && step < wfs.spins.length ? { phase, step } : null;
    case "kettleFs": return kfs && step < kfs.spins.length ? { phase, step } : null;
  }
}

export const CLOVER_RESUME: ResumeKind<CloverResumable, CloverProgress> = {
  game: CLOVER_RESUME_GAME, idPrefix: "clf", phases: CLOVER_RESUME_PHASES, start: { phase: "intro", step: 0 }, sanitize: sanitizeCloverProgress,
};

export function cloverResumeWhere(spin: CloverResumable, p: CloverProgress): string {
  switch (p.phase) {
    case "intro": return "the start; nothing has played yet.";
    case "wheelFs": return `wheel free spin ${p.step + 1} of ${spin.wheel?.freeSpins?.spins.length ?? 0}.`;
    case "kettleIntro": return "the kettle free spins; the Rainbow Wheel is done.";
    case "kettleFs": return `free spin ${p.step + 1} of ${spin.freeSpins?.spins.length ?? 0}.`;
    case "summary": return "the feature total; every part has played.";
  }
}
