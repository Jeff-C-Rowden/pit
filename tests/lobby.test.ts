import { describe, it, expect } from "vitest";
import { filterGames, pushRecent, parseRecent } from "@/lib/lobby";

const games = [
  { href: "/blackjack", name: "Blackjack", meta: "7-spot · six-deck", line: "The pit staple." },
  { href: "/vault", name: "Canopy Spire", meta: "5 reels · 4-tier progressive", line: "Jungle canopy progressive" },
  { href: "/roulette", name: "Roulette", meta: "American wheel · 0 and 00", line: "38 pockets." },
  { href: "/paigow", name: "Pai Gow Poker", meta: "6 seats", line: "Seven cards." },
];

describe("lobby search", () => {
  it("returns everything for an empty query", () => expect(filterGames(games, "  ")).toHaveLength(4));
  it("matches case-insensitively on name", () => expect(filterGames(games, "ROUL").map((g) => g.href)).toEqual(["/roulette"]));
  it("matches meta and requires every word", () => {
    expect(filterGames(games, "progressive").map((g) => g.href)).toEqual(["/vault"]);
    expect(filterGames(games, "pai poker").map((g) => g.href)).toEqual(["/paigow"]);
    expect(filterGames(games, "pai wheel")).toEqual([]);
  });
  it("ignores punctuation", () => expect(filterGames(games, "pai-gow").map((g) => g.href)).toEqual(["/paigow"]));
});

describe("recently played", () => {
  it("puts newest first, dedupes and caps at 3", () => {
    let r: string[] = [];
    for (const h of ["/slot", "/roulette", "/slot", "/craps", "/vault"]) r = pushRecent(r, h);
    expect(r).toEqual(["/vault", "/craps", "/slot"]);
  });
  it("ignores non-game paths", () => expect(pushRecent(["/slot"], "/wallet")).toEqual(["/slot"]));
  it("survives corrupt storage", () => {
    expect(parseRecent("{nope")).toEqual([]);
    expect(parseRecent(JSON.stringify(["/evil", 3, "/craps"]))).toEqual(["/craps"]);
    expect(parseRecent(null)).toEqual([]);
  });
});
