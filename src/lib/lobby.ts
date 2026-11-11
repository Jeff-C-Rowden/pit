// Lobby helpers: popup-free search and "recently played" (client-side only, no ledger writes).
export type LobbyGame = { href: string; name: string; meta: string; line: string };

export const RECENT_KEY = "pit.recentGames.v1";
export const RECENT_MAX = 3;
export const GAME_PATHS = ["/blackjack", "/slot", "/vault", "/buckshot", "/holdem", "/roulette", "/craps", "/paigow"];

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Every word in the query must appear somewhere in the game's name, meta or line. */
export function filterGames<T extends LobbyGame>(games: T[], query: string): T[] {
  const words = norm(query).split(" ").filter(Boolean);
  if (!words.length) return games;
  return games.filter((g) => {
    const hay = norm(`${g.name} ${g.meta} ${g.line} ${g.href.replace("/", "")}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Most-recent-first, de-duplicated, only known game paths, capped. */
export function pushRecent(list: unknown, href: string, max = RECENT_MAX): string[] {
  const prev = parseRecent(list);
  if (!GAME_PATHS.includes(href)) return prev.slice(0, max);
  return [href, ...prev.filter((h) => h !== href)].slice(0, max);
}

export function parseRecent(raw: unknown): string[] {
  let v = raw;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return []; }
  }
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const h of v) if (typeof h === "string" && GAME_PATHS.includes(h) && !out.includes(h)) out.push(h);
  return out;
}

export function readRecent(): string[] {
  try { return parseRecent(window.localStorage.getItem(RECENT_KEY)); } catch { return []; }
}

export function recordRecent(href: string) {
  try {
    const next = pushRecent(window.localStorage.getItem(RECENT_KEY), href);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* storage blocked: ignore */ }
}
