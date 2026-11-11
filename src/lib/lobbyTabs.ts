// Floor category tabs (Slots / Tables / All) and honest tile ribbons. Pure, client-safe.
export const LOBBY_TABS = ["all", "slots", "tables"] as const;
export type LobbyTab = (typeof LOBBY_TABS)[number];

export const TAB_LABEL: Record<LobbyTab, string> = { all: "All", slots: "Slots", tables: "Tables" };

const SLOT_PATHS = new Set(["/slot", "/vault", "/buckshot", "/bounty", "/mine", "/prairie"]);

export function categoryOf(href: string): Exclude<LobbyTab, "all"> {
  return SLOT_PATHS.has(href) ? "slots" : "tables";
}

export function parseTab(raw: unknown): LobbyTab {
  const v = typeof raw === "string" ? raw.replace(/^#/, "").toLowerCase() : "";
  return (LOBBY_TABS as readonly string[]).includes(v) ? (v as LobbyTab) : "all";
}

export function filterByTab<T extends { href: string }>(games: T[], tab: LobbyTab): T[] {
  if (tab === "all") return games;
  return games.filter((g) => categoryOf(g.href) === tab);
}

export function tabCounts<T extends { href: string }>(games: T[]): Record<LobbyTab, number> {
  const slots = games.filter((g) => categoryOf(g.href) === "slots").length;
  return { all: games.length, slots, tables: games.length - slots };
}

/** Corner ribbon text. Describes the game, never its "heat": no HOT, no due, no streak claims. */
export function tileRibbon(g: { href: string; progressive?: boolean; cash?: boolean; bonusCash?: boolean }): string {
  if (g.bonusCash) return "Bonus to Cash";
  if (g.progressive) return "Jackpot";
  if (categoryOf(g.href) === "slots") return "Slot";
  if (g.cash) return "Poker";
  return "Table";
}
