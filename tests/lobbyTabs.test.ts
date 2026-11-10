import { describe, it, expect } from "vitest";
import { categoryOf, filterByTab, parseTab, tabCounts, tileRibbon } from "@/lib/lobbyTabs";

const games = ["/blackjack", "/slot", "/vault", "/holdem", "/roulette", "/craps", "/paigow"].map((href) => ({ href }));

describe("Floor category tabs", () => {
  it("splits slots from tables", () => {
    expect(categoryOf("/slot")).toBe("slots");
    expect(categoryOf("/vault")).toBe("slots");
    expect(categoryOf("/roulette")).toBe("tables");
    expect(filterByTab(games, "slots").map((g) => g.href)).toEqual(["/slot", "/vault"]);
    expect(filterByTab(games, "tables")).toHaveLength(5);
    expect(filterByTab(games, "all")).toHaveLength(7);
    expect(tabCounts(games)).toEqual({ all: 7, slots: 2, tables: 5 });
  });
  it("parses unknown tabs as all", () => {
    expect(parseTab("#slots")).toBe("slots");
    expect(parseTab("TABLES")).toBe("tables");
    expect(parseTab("hot")).toBe("all");
    expect(parseTab(undefined)).toBe("all");
  });
  it("ribbons describe the game, never its heat", () => {
    const labels = [tileRibbon({ href: "/vault", progressive: true }), tileRibbon({ href: "/slot" }), tileRibbon({ href: "/holdem", cash: true }), tileRibbon({ href: "/craps" })];
    expect(labels).toEqual(["Jackpot", "Slot", "Poker", "Table"]);
    for (const l of labels) expect(l).not.toMatch(/hot|due|streak|win/i);
  });
});
