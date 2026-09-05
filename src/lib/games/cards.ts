export type Suit = "s" | "h" | "d" | "c";
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export type Card = {
  rank: Rank;
  suit: Suit;
  /** Pai gow joker */
  joker?: boolean;
};

export const SUITS: Suit[] = ["s", "h", "d", "c"];
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export const RANK_LABEL: Record<Rank, string> = {
  1: "A",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
};

export const SUIT_GLYPH: Record<Suit, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

export function cardId(c: Card): string {
  if (c.joker) return "JO";
  return `${RANK_LABEL[c.rank]}${c.suit}`;
}

export function parseCard(id: string): Card {
  if (id === "JO") return { rank: 1, suit: "s", joker: true };
  const suit = id.slice(-1) as Suit;
  const r = id.slice(0, -1);
  const rank = (
    r === "A" ? 1 : r === "J" ? 11 : r === "Q" ? 12 : r === "K" ? 13 : Number(r)
  ) as Rank;
  return { rank, suit };
}

export function standardDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s });
  return d;
}

export function shoe(decks: number): Card[] {
  const d: Card[] = [];
  for (let i = 0; i < decks; i++) d.push(...standardDeck());
  return d;
}

export function paiGowDeck(): Card[] {
  return [...standardDeck(), { rank: 1, suit: "s", joker: true }];
}

export function blackjackValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 1) {
      aces += 1;
      total += 11;
    } else if (c.rank >= 10) total += 10;
    else total += c.rank;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 && total <= 21 };
}

export function isBlackjack(cards: Card[]): boolean {
  if (cards.length !== 2) return false;
  const { total } = blackjackValue(cards);
  return total === 21;
}

export function cardPublic(c: Card) {
  return { id: cardId(c), rank: c.joker ? "JOKER" : RANK_LABEL[c.rank], suit: c.suit, joker: !!c.joker, red: c.suit === "h" || c.suit === "d" };
}
