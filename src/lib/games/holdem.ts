import { cardPublic, standardDeck, type Card, RANK_LABEL } from "./cards";
import { shuffle, newId, randInt } from "../rng";

export const SB = 100;
export const BB = 200;

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown" | "folded";

export type HoldemState = {
  id: string;
  buttonIsPlayer: boolean;
  deck: Card[];
  playerHole: Card[];
  houseHole: Card[];
  board: Card[];
  pot: number;
  playerStackCommitted: number;
  houseStackCommitted: number;
  toAct: "player" | "house" | "none";
  street: Street;
  currentBet: number;
  playerBet: number;
  houseBet: number;
  lastRaise: number;
  playerFolded: boolean;
  houseFolded: boolean;
  winner?: "player" | "house" | "split";
  result?: string;
  payoutCents?: number;
  log: string[];
};

const RANK_ACE_HIGH = (r: number) => (r === 1 ? 14 : r);

type Ranked = { cat: number; kickers: number[]; name: string };

function combinations<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i]!);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

function evalFive(cards: Card[]): Ranked {
  const ranks = cards.map((c) => RANK_ACE_HIGH(c.rank)).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const flush = suits.every((s) => s === suits[0]);
  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  let straightHigh = 0;
  const rset = new Set(ranks);
  const seq = uniq.slice();
  if (rset.has(14)) seq.push(1); // wheel helper for unique list
  const u = [...new Set(cards.map((c) => RANK_ACE_HIGH(c.rank)))].sort((a, b) => b - a);
  const wheel = [14, 5, 4, 3, 2];
  if (wheel.every((x) => rset.has(x))) straightHigh = 5;
  for (let hi = 14; hi >= 6; hi--) {
    if ([hi, hi - 1, hi - 2, hi - 3, hi - 4].every((x) => rset.has(x))) {
      straightHigh = hi;
      break;
    }
  }
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const straight = straightHigh > 0;
  if (flush && straight) return { cat: 8, kickers: [straightHigh], name: straightHigh === 14 ? "royal flush" : "straight flush" };
  if (groups[0]![1] === 4) return { cat: 7, kickers: [groups[0]![0], groups[1]![0]], name: "four of a kind" };
  if (groups[0]![1] === 3 && groups[1]![1] === 2) return { cat: 6, kickers: [groups[0]![0], groups[1]![0]], name: "full house" };
  if (flush) return { cat: 5, kickers: ranks, name: "flush" };
  if (straight) return { cat: 4, kickers: [straightHigh], name: "straight" };
  if (groups[0]![1] === 3) return { cat: 3, kickers: [groups[0]![0], ...groups.slice(1).map((g) => g[0])], name: "three of a kind" };
  if (groups[0]![1] === 2 && groups[1]![1] === 2) {
    const p = [groups[0]![0], groups[1]![0]].sort((a, b) => b - a);
    return { cat: 2, kickers: [...p, groups[2]![0]], name: "two pair" };
  }
  if (groups[0]![1] === 2) return { cat: 1, kickers: [groups[0]![0], ...groups.slice(1).map((g) => g[0])], name: "pair" };
  void u;
  void seq;
  return { cat: 0, kickers: ranks, name: "high card" };
}

export function bestHand(hole: Card[], board: Card[]): Ranked {
  const all = [...hole, ...board];
  if (all.length < 5) return evalFive(all.concat(all).slice(0, 5)); // shouldn't happen at showdown
  let best: Ranked | null = null;
  for (const five of combinations(all, 5)) {
    const e = evalFive(five);
    if (!best || cmpRanked(e, best) > 0) best = e;
  }
  return best!;
}

export function cmpRanked(a: Ranked, b: Ranked): number {
  if (a.cat !== b.cat) return a.cat - b.cat;
  const n = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < n; i++) {
    const d = (a.kickers[i] || 0) - (b.kickers[i] || 0);
    if (d) return d;
  }
  return 0;
}

export function startHoldem(buttonIsPlayer: boolean): { state: HoldemState; playerBlind: number } {
  const deck = shuffle(standardDeck());
  const playerHole = [deck.pop()!, deck.pop()!];
  const houseHole = [deck.pop()!, deck.pop()!];
  const s: HoldemState = {
    id: newId(),
    buttonIsPlayer,
    deck,
    playerHole,
    houseHole,
    board: [],
    pot: 0,
    playerStackCommitted: 0,
    houseStackCommitted: 0,
    toAct: "player",
    street: "preflop",
    currentBet: BB,
    playerBet: 0,
    houseBet: 0,
    lastRaise: BB,
    playerFolded: false,
    houseFolded: false,
    log: [],
  };
  // HU: button posts SB, other posts BB
  if (buttonIsPlayer) {
    s.playerBet = SB;
    s.houseBet = BB;
    s.toAct = "player";
    s.log.push("You post the small blind. House posts the big blind.");
  } else {
    s.houseBet = SB;
    s.playerBet = BB;
    s.toAct = "house";
    s.log.push("House posts the small blind. You post the big blind.");
  }
  s.playerStackCommitted = s.playerBet;
  s.houseStackCommitted = s.houseBet;
  s.pot = s.playerBet + s.houseBet;
  const playerBlind = s.playerBet;
  if (s.toAct === "house") houseAct(s);
  return { state: s, playerBlind };
}

function dealBoard(s: HoldemState, n: number) {
  s.deck.pop(); // burn
  for (let i = 0; i < n; i++) s.board.push(s.deck.pop()!);
}

function nextStreet(s: HoldemState) {
  s.playerBet = 0;
  s.houseBet = 0;
  s.currentBet = 0;
  s.lastRaise = BB;
  if (s.street === "preflop") {
    dealBoard(s, 3);
    s.street = "flop";
    s.log.push("Flop.");
  } else if (s.street === "flop") {
    dealBoard(s, 1);
    s.street = "turn";
    s.log.push("Turn.");
  } else if (s.street === "turn") {
    dealBoard(s, 1);
    s.street = "river";
    s.log.push("River.");
  } else {
    showdown(s);
    return;
  }
  s.toAct = s.buttonIsPlayer ? "house" : "player";
  if (s.toAct === "house") houseAct(s);
}

function showdown(s: HoldemState) {
  s.street = "showdown";
  s.toAct = "none";
  const p = bestHand(s.playerHole, s.board);
  const h = bestHand(s.houseHole, s.board);
  const c = cmpRanked(p, h);
  if (c > 0) {
    s.winner = "player";
    s.payoutCents = s.pot;
    s.result = `You win with ${p.name}`;
  } else if (c < 0) {
    s.winner = "house";
    s.payoutCents = 0;
    s.result = `House wins with ${h.name}`;
  } else {
    s.winner = "split";
    s.payoutCents = Math.floor(s.pot / 2);
    s.result = `Split pot · ${p.name}`;
  }
}

function closeIfFolded(s: HoldemState) {
  if (s.playerFolded) {
    s.street = "folded";
    s.toAct = "none";
    s.winner = "house";
    s.payoutCents = 0;
    s.result = "You folded";
  } else if (s.houseFolded) {
    s.street = "folded";
    s.toAct = "none";
    s.winner = "player";
    s.payoutCents = s.pot;
    s.result = "House folded";
  }
}

function bothMatched(s: HoldemState) {
  return s.playerBet === s.houseBet && s.playerBet === s.currentBet;
}

export type PlayerAction = { type: "fold" } | { type: "check" } | { type: "call" } | { type: "bet" | "raise"; amountCents: number };

export function playerAct(s: HoldemState, a: PlayerAction): { extraDebit: number } {
  if (s.toAct !== "player") throw new Error("not your turn");
  const extra = applyAction(s, "player", a);
  if (s.playerFolded || s.houseFolded) {
    closeIfFolded(s);
    return { extraDebit: extra };
  }
  if (s.toAct === "house") houseAct(s);
  if (s.playerFolded || s.houseFolded) closeIfFolded(s);
  return { extraDebit: extra };
}

function applyAction(s: HoldemState, who: "player" | "house", a: PlayerAction): number {
  const isP = who === "player";
  const myBet = () => (isP ? s.playerBet : s.houseBet);
  const setBet = (n: number) => { if (isP) s.playerBet = n; else s.houseBet = n; };
  const addCommitted = (n: number) => {
    if (isP) s.playerStackCommitted += n;
    else s.houseStackCommitted += n;
  };
  let extra = 0;
  const name = isP ? "You" : "House";
  if (a.type === "fold") {
    if (isP) s.playerFolded = true; else s.houseFolded = true;
    s.log.push(`${name} fold.`);
    s.toAct = "none";
    return 0;
  }
  if (a.type === "check") {
    if (s.currentBet !== myBet()) throw new Error("cannot check");
    s.log.push(`${name} check.`);
    afterVoluntary(s, who, false);
    return 0;
  }
  if (a.type === "call") {
    const need = s.currentBet - myBet();
    if (need <= 0) throw new Error("nothing to call");
    extra = need;
    setBet(s.currentBet);
    addCommitted(need);
    s.pot += need;
    s.log.push(`${name} call ${need}.`);
    afterVoluntary(s, who, false);
    return isP ? extra : 0;
  }
  // bet / raise
  const amt = a.amountCents;
  if (!Number.isInteger(amt) || amt <= 0) throw new Error("bad bet");
  const minRaiseTo = s.currentBet === 0 ? BB : s.currentBet + s.lastRaise;
  const raiseTo = s.currentBet === 0 ? amt : amt; // amount is the total bet on this street
  if (s.currentBet === 0) {
    if (amt < BB) throw new Error("minimum bet is the big blind");
    extra = amt - myBet();
    const prev = myBet();
    setBet(amt);
    addCommitted(extra);
    s.pot += extra;
    s.lastRaise = amt;
    s.currentBet = amt;
    s.log.push(`${name} bet ${amt}.`);
    void prev;
  } else {
    if (raiseTo < minRaiseTo) throw new Error(`minimum raise is to ${minRaiseTo}`);
    extra = raiseTo - myBet();
    const raiseSize = raiseTo - s.currentBet;
    setBet(raiseTo);
    addCommitted(extra);
    s.pot += extra;
    s.lastRaise = raiseSize;
    s.currentBet = raiseTo;
    s.log.push(`${name} raise to ${raiseTo}.`);
  }
  afterVoluntary(s, who, true);
  return isP ? extra : 0;
}

function afterVoluntary(s: HoldemState, who: "player" | "house", wasAggro: boolean) {
  const other = who === "player" ? "house" : "player";
  if (wasAggro) {
    s.toAct = other;
    return;
  }
  // check or call
  if (s.street === "preflop") {
    // HU preflop: BB can check after SB limp-complete, or if BB already matched via call from SB after BB open...
    if (bothMatched(s)) {
      // if the BB hasn't had option and currentBet is BB and nobody raised, BB still to act
      const bbIsPlayer = !s.buttonIsPlayer;
      const bbWho: "player" | "house" = bbIsPlayer ? "player" : "house";
      if (s.currentBet === BB && who !== bbWho && s.log.filter((l) => l.includes("raise") || l.includes("bet")).length === 0) {
        s.toAct = bbWho;
        return;
      }
      nextStreet(s);
      return;
    }
    s.toAct = other;
    return;
  }
  if (bothMatched(s)) {
    // first actor checked, second must act unless second also checked
    if (who === firstActor(s)) {
      s.toAct = other;
    } else {
      nextStreet(s);
    }
    return;
  }
  s.toAct = other;
}

function firstActor(s: HoldemState): "player" | "house" {
  if (s.street === "preflop") return s.buttonIsPlayer ? "player" : "house";
  return s.buttonIsPlayer ? "house" : "player";
}

function holeStrength(hole: Card[]): number {
  const a = RANK_ACE_HIGH(hole[0]!.rank);
  const b = RANK_ACE_HIGH(hole[1]!.rank);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const pair = a === b;
  const suited = hole[0]!.suit === hole[1]!.suit;
  let s = hi / 14;
  if (pair) s = 0.55 + hi / 28;
  else {
    s = (hi + lo / 2) / 21;
    if (suited) s += 0.05;
    if (hi - lo <= 2) s += 0.04;
  }
  return Math.min(0.99, s);
}

function houseAct(s: HoldemState) {
  let guard = 0;
  while (s.toAct === "house" && s.street !== "showdown" && s.street !== "folded" && guard++ < 8) {
    const toCall = s.currentBet - s.houseBet;
    const hs = s.board.length >= 3 ? handScore(s.houseHole, s.board) : holeStrength(s.houseHole);
    let action: PlayerAction;
    if (toCall === 0) {
      if (hs > 0.72 && randInt(100) < 70) action = { type: "bet", amountCents: Math.max(BB, Math.floor(s.pot * 0.6)) };
      else if (hs > 0.55 && randInt(100) < 35) action = { type: "bet", amountCents: Math.max(BB, Math.floor(s.pot * 0.45)) };
      else action = { type: "check" };
    } else {
      const potOdds = toCall / (s.pot + toCall);
      if (hs < 0.28 && potOdds > 0.2) action = { type: "fold" };
      else if (hs > 0.78 && randInt(100) < 55) {
        const raiseTo = s.currentBet + Math.max(s.lastRaise, Math.floor(s.pot * 0.7));
        action = { type: "raise", amountCents: raiseTo };
      } else if (hs + 0.08 >= potOdds) action = { type: "call" };
      else action = { type: "fold" };
    }
    try {
      applyAction(s, "house", action);
    } catch {
      if (toCall > 0) applyAction(s, "house", { type: "call" });
      else applyAction(s, "house", { type: "check" });
    }
  }
}

function handScore(hole: Card[], board: Card[]): number {
  const e = bestHand(hole, board);
  return Math.min(0.99, (e.cat + 1) / 9 + (e.kickers[0] || 0) / 140);
}

export function publicHoldem(s: HoldemState) {
  const done = s.street === "showdown" || s.street === "folded";
  return {
    id: s.id,
    street: s.street,
    buttonIsPlayer: s.buttonIsPlayer,
    blinds: { sb: SB, bb: BB },
    pot: s.pot,
    toAct: s.toAct,
    currentBet: s.currentBet,
    playerBet: s.playerBet,
    houseBet: s.houseBet,
    toCall: Math.max(0, s.currentBet - s.playerBet),
    minRaiseTo: s.currentBet === 0 ? BB : s.currentBet + s.lastRaise,
    playerHole: s.playerHole.map(cardPublic),
    houseHole: done ? s.houseHole.map(cardPublic) : s.houseHole.map(() => ({ id: "??", rank: "?", suit: "s", joker: false, red: false })),
    board: s.board.map(cardPublic),
    result: s.result ?? null,
    winner: s.winner ?? null,
    payoutCents: done ? s.payoutCents ?? 0 : null,
    log: s.log,
    playerHandName: done && s.board.length >= 5 ? bestHand(s.playerHole, s.board).name : null,
    houseHandName: done && s.board.length >= 5 ? bestHand(s.houseHole, s.board).name : null,
    rankLabel: RANK_LABEL,
  };
}
