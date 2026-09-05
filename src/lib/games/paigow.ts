import { cardPublic, paiGowDeck, type Card } from "./cards";
import { shuffle, newId } from "../rng";

export type PaiGowState = {
  id: string;
  betCents: number;
  playerCards: Card[];
  dealerCards: Card[];
  playerHigh?: Card[];
  playerLow?: Card[];
  dealerHigh?: Card[];
  dealerLow?: Card[];
  phase: "set" | "settled";
  result?: string;
  payoutCents?: number;
  commissionCents?: number;
};

const ACE = 14;
const r = (c: Card) => (c.joker ? ACE : c.rank === 1 ? ACE : c.rank);

function isFlush(cards: Card[]): boolean {
  const suits = cards.filter((c) => !c.joker).map((c) => c.suit);
  return suits.every((s) => s === suits[0]);
}

function straightHigh(cards: Card[]): number {
  const jokers = cards.filter((c) => c.joker).length;
  const ranks: number[] = [...new Set(cards.filter((c) => !c.joker).map(r))].sort((a, b) => a - b);
  if (ranks.length + jokers !== cards.length && cards.length === 5) {
    // duplicates can't straight unless joker filling - duplicates fail
    if (ranks.length + jokers < 5) return 0;
  }
  // A-5 wheel
  const need = (seq: number[]) => seq.filter((n) => !ranks.includes(n)).length <= jokers;
  if (cards.length === 5) {
    for (let hi = 14; hi >= 5; hi--) {
      const seq = hi === 5 ? [14, 2, 3, 4, 5] : [hi - 4, hi - 3, hi - 2, hi - 1, hi];
      if (need(seq)) return hi;
    }
  }
  return 0;
}

type Ranked = { cat: number; kick: number[]; name: string };

function counts(cards: Card[]): Map<number, number> {
  const m = new Map<number, number>();
  let jokers = 0;
  for (const c of cards) {
    if (c.joker) jokers += 1;
    else m.set(r(c), (m.get(r(c)) || 0) + 1);
  }
  if (jokers) {
    // use jokers as aces unless they complete straight/flush (handled by caller for 5-card)
    const ace = m.get(ACE) || 0;
    m.set(ACE, ace + jokers);
  }
  return m;
}

export function evalFive(cards: Card[]): Ranked {
  if (cards.length !== 5) throw new Error("high hand is 5 cards");
  const flush = isFlush(cards);
  const sh = straightHigh(cards);
  const m = new Map<number, number>();
  let jokers = 0;
  for (const c of cards) {
    if (c.joker) jokers++;
    else m.set(r(c), (m.get(r(c)) || 0) + 1);
  }
  // assign jokers to maximize category
  if (flush && sh) return { cat: 8, kick: [sh], name: sh === 14 ? "royal flush" : "straight flush" };
  const groups = [...m.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  // apply jokers to highest count
  if (jokers && !flush) {
    if (groups.length) groups[0]![1] += jokers;
    else groups.push([ACE, jokers]);
  } else if (jokers && flush) {
    // already handled straight flush; jokers as aces in flush kickers
  }
  groups.sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const top = groups[0]?.[1] || 0;
  if (top === 5) return { cat: 9, kick: [groups[0]![0]], name: "five aces" };
  if (top === 4) return { cat: 7, kick: [groups[0]![0], groups[1]?.[0] || 0], name: "four of a kind" };
  if (top === 3 && (groups[1]?.[1] || 0) === 2) return { cat: 6, kick: [groups[0]![0], groups[1]![0]], name: "full house" };
  if (flush) {
    const kick = cards.map(r).sort((a, b) => b - a);
    return { cat: 5, kick, name: "flush" };
  }
  if (sh) return { cat: 4, kick: [sh], name: "straight" };
  if (top === 3) return { cat: 3, kick: [groups[0]![0], ...groups.slice(1).map((g) => g[0])], name: "three of a kind" };
  if (top === 2 && (groups[1]?.[1] || 0) === 2) {
    const ps = [groups[0]![0], groups[1]![0]].sort((a, b) => b - a);
    return { cat: 2, kick: [...ps, groups[2]?.[0] || 0], name: "two pair" };
  }
  if (top === 2) return { cat: 1, kick: [groups[0]![0], ...groups.slice(1).map((g) => g[0])], name: "pair" };
  return { cat: 0, kick: cards.map(r).sort((a, b) => b - a), name: "high card" };
}

export function evalTwo(cards: Card[]): Ranked {
  if (cards.length !== 2) throw new Error("low hand is 2 cards");
  const a = r(cards[0]!), b = r(cards[1]!);
  if (a === b) return { cat: 1, kick: [a], name: "pair" };
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return { cat: 0, kick: [hi, lo], name: "high card" };
}

export function cmpHands(a: Ranked, b: Ranked): number {
  if (a.cat !== b.cat) return a.cat - b.cat;
  for (let i = 0; i < Math.max(a.kick.length, b.kick.length); i++) {
    const d = (a.kick[i] || 0) - (b.kick[i] || 0);
    if (d) return d;
  }
  return 0;
}

function sortedByRank(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => r(b) - r(a));
}

/** Simplified but playable House Way. */
export function houseWay(cards: Card[]): { high: Card[]; low: Card[] } {
  const srt = sortedByRank(cards);
  const m = counts(cards);
  const pairs: number[] = [...m.entries()].filter(([, n]) => n >= 2).map(([k]) => k).sort((a, b) => b - a);

  const take = (rank: number, n: number, from: Card[]) => {
    const out: Card[] = [];
    const rest: Card[] = [];
    let need = n;
    for (const c of from) {
      if (need && r(c) === rank) { out.push(c); need--; }
      else rest.push(c);
    }
    return { out, rest };
  };

  if (pairs.length >= 3) {
    // three pair: highest pair in front
    const hi = pairs[0]!;
    const { out: low, rest } = take(hi, 2, srt);
    return { high: rest, low };
  }
  if (pairs.length === 2) {
    const [p1, p2] = pairs;
    // put smaller pair in front if back still beats front
    const { out: low, rest } = take(p2!, 2, srt);
    const high = rest;
    if (cmpHands(evalFive(high), evalTwo(low)) >= 0) return { high, low };
    const alt = take(p1!, 2, srt);
    return { high: alt.rest, low: alt.out };
  }
  if (pairs.length === 1) {
    const { out: pair, rest } = take(pairs[0]!, 2, srt);
    const kick = sortedByRank(rest);
    const low = [kick[0]!, kick[1]!];
    const high = [pair[0]!, pair[1]!, kick[2]!, kick[3]!, kick[4]!];
    if (cmpHands(evalFive(high), evalTwo(low)) >= 0) return { high, low };
    // front would beat back: put two lowest in front
    const low2 = [kick[3]!, kick[4]!];
    const high2 = [pair[0]!, pair[1]!, kick[0]!, kick[1]!, kick[2]!];
    return { high: high2, low: low2 };
  }
  // no pair: 2nd and 3rd highest in front if legal
  const low = [srt[1]!, srt[2]!];
  const high = [srt[0]!, srt[3]!, srt[4]!, srt[5]!, srt[6]!];
  if (cmpHands(evalFive(high), evalTwo(low)) >= 0) return { high, low };
  return { high: [srt[0]!, srt[1]!, srt[2]!, srt[3]!, srt[4]!], low: [srt[5]!, srt[6]!] };
}

export function startPaiGow(betCents: number): PaiGowState {
  if (!Number.isInteger(betCents) || betCents < 500 || betCents > 5_000_00) {
    throw new Error("bet must be between $5.00 and $5,000.00");
  }
  const deck = shuffle(paiGowDeck());
  return {
    id: newId(),
    betCents,
    playerCards: deck.slice(0, 7),
    dealerCards: deck.slice(7, 14),
    phase: "set",
  };
}

export function setHands(s: PaiGowState, highIdx: number[], lowIdx: number[]): PaiGowState {
  if (s.phase !== "set") throw new Error("already set");
  if (highIdx.length !== 5 || lowIdx.length !== 2) throw new Error("set 5-card high and 2-card low");
  const used = new Set([...highIdx, ...lowIdx]);
  if (used.size !== 7) throw new Error("each card once");
  const high = highIdx.map((i) => {
    const c = s.playerCards[i];
    if (!c) throw new Error("bad index");
    return c;
  });
  const low = lowIdx.map((i) => {
    const c = s.playerCards[i];
    if (!c) throw new Error("bad index");
    return c;
  });
  if (cmpHands(evalFive(high), evalTwo(low)) < 0) throw new Error("high hand must outrank low hand (foul)");
  s.playerHigh = high;
  s.playerLow = low;
  const hw = houseWay(s.dealerCards);
  s.dealerHigh = hw.high;
  s.dealerLow = hw.low;
  settle(s);
  return s;
}

export function setHouseWayPlayer(s: PaiGowState): PaiGowState {
  const hw = houseWay(s.playerCards);
  const idx = (hand: Card[]) => hand.map((c) => s.playerCards.findIndex((x) => x === c));
  return setHands(s, idx(hw.high), idx(hw.low));
}

function settle(s: PaiGowState) {
  const ph = evalFive(s.playerHigh!);
  const pl = evalTwo(s.playerLow!);
  const dh = evalFive(s.dealerHigh!);
  const dl = evalTwo(s.dealerLow!);
  // copies (ties) go to the banker (house)
  const highWin = cmpHands(ph, dh) > 0;
  const lowWin = cmpHands(pl, dl) > 0;
  const highLose = cmpHands(ph, dh) <= 0;
  const lowLose = cmpHands(pl, dl) <= 0;
  s.phase = "settled";
  if (highWin && lowWin) {
    const gross = s.betCents * 2;
    const commission = Math.ceil(s.betCents * 0.05);
    s.commissionCents = commission;
    s.payoutCents = gross - commission;
    s.result = `win both · ${ph.name} / ${pl.name} · 5% commission ${commission}¢`;
  } else if (highLose && lowLose) {
    s.payoutCents = 0;
    s.commissionCents = 0;
    s.result = `lose both · dealer ${dh.name} / ${dl.name}`;
  } else {
    s.payoutCents = s.betCents;
    s.commissionCents = 0;
    s.result = `push · high ${highWin ? "you" : "house"} · low ${lowWin ? "you" : "house"}`;
  }
}

export function publicPaiGow(s: PaiGowState) {
  return {
    id: s.id,
    betCents: s.betCents,
    phase: s.phase,
    playerCards: s.playerCards.map(cardPublic),
    dealerCards: s.phase === "settled" ? s.dealerCards.map(cardPublic) : s.dealerCards.map(() => ({ id: "??", rank: "?", suit: "s", joker: false, red: false })),
    playerHigh: s.playerHigh?.map(cardPublic) ?? null,
    playerLow: s.playerLow?.map(cardPublic) ?? null,
    dealerHigh: s.dealerHigh?.map(cardPublic) ?? null,
    dealerLow: s.dealerLow?.map(cardPublic) ?? null,
    result: s.result ?? null,
    payoutCents: s.phase === "settled" ? s.payoutCents ?? 0 : null,
    commissionCents: s.commissionCents ?? null,
    houseWayHint: houseWay(s.playerCards),
  };
}
