// Exploration achievements (backlog #9). Client-side only (localStorage), no ledger writes,
// no chip rewards. They reward looking around — never losses, bet volume, streaks or time played.
import { GAME_PATHS } from "./lobby";

export const ACH_KEY = "pit.achievements.v1";
export const ACH_EVENT = "pit-achievement";

export type AchId = "first-seat" | "every-table" | "rules" | "coach" | "limit";
export type AchDef = { id: AchId; title: string; hint: string };

export const ACHIEVEMENTS: AchDef[] = [
  { id: "first-seat", title: "Pulled up a chair", hint: "Take a seat at any table." },
  { id: "every-table", title: "Toured the floor", hint: "Take a seat at every table." },
  { id: "rules", title: "Read the house rules", hint: "Open the Rules page." },
  { id: "coach", title: "Learned a table", hint: "Open a How to play card." },
  { id: "limit", title: "Set a limit", hint: "Save a spending limit in the Cage." },
];

export type AchEvent =
  | { kind: "seat"; href: string }
  | { kind: "rules" }
  | { kind: "coach" }
  | { kind: "limit" };

export type AchProgress = { tables: string[]; rules: boolean; coach: boolean; limit: boolean; toasted: AchId[] };

export const emptyProgress = (): AchProgress => ({ tables: [], rules: false, coach: false, limit: false, toasted: [] });
const ACH_IDS = ACHIEVEMENTS.map((a) => a.id) as string[];

export function parseProgress(raw: unknown): AchProgress {
  let v = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return emptyProgress(); } }
  if (!v || typeof v !== "object" || Array.isArray(v)) return emptyProgress();
  const o = v as Record<string, unknown>;
  const tables = Array.isArray(o.tables) ? GAME_PATHS.filter((p) => (o.tables as unknown[]).includes(p)) : [];
  const toasted = Array.isArray(o.toasted) ? (ACH_IDS.filter((id) => (o.toasted as unknown[]).includes(id)) as AchId[]) : [];
  return { tables, rules: o.rules === true, coach: o.coach === true, limit: o.limit === true, toasted };
}

export function unlockedIds(p: AchProgress): AchId[] {
  const out: AchId[] = [];
  if (p.tables.length >= 1) out.push("first-seat");
  if (GAME_PATHS.every((g) => p.tables.includes(g))) out.push("every-table");
  if (p.rules) out.push("rules");
  if (p.coach) out.push("coach");
  if (p.limit) out.push("limit");
  return out;
}

/** Pure reducer: returns the next progress and the ids this event newly unlocked. */
export function applyEvent(prev: AchProgress, ev: AchEvent): { next: AchProgress; unlocked: AchId[] } {
  const before = unlockedIds(prev);
  const next: AchProgress = { ...prev, tables: [...prev.tables], toasted: [...prev.toasted] };
  if (ev.kind === "seat") {
    if (GAME_PATHS.includes(ev.href) && !next.tables.includes(ev.href)) next.tables = GAME_PATHS.filter((g) => g === ev.href || next.tables.includes(g));
  } else if (ev.kind === "rules") next.rules = true;
  else if (ev.kind === "coach") next.coach = true;
  else if (ev.kind === "limit") next.limit = true;
  const unlocked = unlockedIds(next).filter((id) => !before.includes(id));
  return { next, unlocked };
}

/** Unlocked but not yet announced — each unlock gets at most one quiet toast. */
export function pendingToasts(p: AchProgress): AchId[] {
  return unlockedIds(p).filter((id) => !p.toasted.includes(id));
}

export function markToasted(p: AchProgress, ids: AchId[]): AchProgress {
  return { ...p, toasted: ACH_IDS.filter((id) => p.toasted.includes(id as AchId) || ids.includes(id as AchId)) as AchId[] };
}

export function toastText(ids: AchId[]): string | null {
  const titles = ids.map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.title).filter(Boolean) as string[];
  if (!titles.length) return null;
  return titles.length === 1 ? `Achievement: ${titles[0]}` : `Achievements: ${titles.join(" · ")}`;
}

export function summary(p: AchProgress) {
  const got = unlockedIds(p);
  return { done: got.length, total: ACHIEVEMENTS.length, tablesSeen: p.tables.length, tablesTotal: GAME_PATHS.length, got };
}

export function readProgress(): AchProgress {
  try { return parseProgress(window.localStorage.getItem(ACH_KEY)); } catch { return emptyProgress(); }
}

export function writeProgress(p: AchProgress) {
  try { window.localStorage.setItem(ACH_KEY, JSON.stringify(p)); } catch { /* storage blocked */ }
}

/** Browser helper: record an exploration event; announces newly unlocked ids via a window event. */
export function recordAchievement(ev: AchEvent): AchId[] {
  if (typeof window === "undefined") return [];
  const { next, unlocked } = applyEvent(readProgress(), ev);
  writeProgress(next);
  if (unlocked.length) { try { window.dispatchEvent(new CustomEvent(ACH_EVENT, { detail: unlocked })); } catch {} }
  return unlocked;
}
