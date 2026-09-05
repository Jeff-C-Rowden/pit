import { blackjackValue, cardPublic, isBlackjack, shoe, type Card } from "./cards";
import { shuffle, newId } from "../rng";

export type BjHand = { cards: Card[]; betCents: number; stood: boolean; doubled: boolean; bust: boolean };
export type BjState = {
  id: string;
  shoe: Card[];
  discard: number;
  playerHands: BjHand[];
  active: number;
  dealer: Card[];
  insuranceCents: number;
  insuranceOffered: boolean;
  insuranceResolved: boolean;
  canSplit: boolean;
  phase: "insurance" | "play" | "dealer" | "settled";
  result?: string;
  payoutCents?: number;
};

function draw(s: BjState): Card {
  if (s.shoe.length < 20) {
    s.shoe = shuffle(shoe(6));
  }
  const c = s.shoe.shift();
  if (!c) throw new Error("empty shoe");
  return c;
}

function handValue(h: Card[]) {
  return blackjackValue(h);
}

function isPair(h: Card[]): boolean {
  if (h.length !== 2) return false;
  const v = (r: number) => (r === 1 ? 11 : r >= 10 ? 10 : r);
  return v(h[0]!.rank) === v(h[1]!.rank);
}


export function startBlackjackWithCards(betCents: number, ordered: Card[]): BjState {
  const s = startBlackjack(betCents);
  // rebuild from a known order: player, player, dealer, dealer, then rest
  s.shoe = ordered.slice();
  s.playerHands = [{ cards: [s.shoe.shift()!, s.shoe.shift()!], betCents, stood: false, doubled: false, bust: false }];
  s.dealer = [s.shoe.shift()!, s.shoe.shift()!];
  s.active = 0;
  s.insuranceCents = 0;
  s.insuranceOffered = false;
  s.insuranceResolved = false;
  s.canSplit = s.playerHands[0]!.cards[0]!.rank === s.playerHands[0]!.cards[1]!.rank
    || ([10,11,12,13].includes(s.playerHands[0]!.cards[0]!.rank) && [10,11,12,13].includes(s.playerHands[0]!.cards[1]!.rank));
  s.phase = "play";
  s.result = undefined;
  s.payoutCents = undefined;
  const pBj = s.playerHands[0]!.cards.length === 2 && blackjackValue(s.playerHands[0]!.cards).total === 21;
  const dBj = s.dealer.length === 2 && blackjackValue(s.dealer).total === 21;
  const dealerAce = s.dealer[0]!.rank === 1;
  if (dealerAce && !pBj) {
    s.phase = "insurance";
    s.insuranceOffered = true;
    return s;
  }
  if (pBj || dBj) {
    s.phase = "settled";
    if (pBj && dBj) { s.result = "push"; s.payoutCents = betCents; }
    else if (pBj) { s.result = "blackjack"; s.payoutCents = betCents + Math.floor(betCents * 3 / 2); }
    else { s.result = "dealer blackjack"; s.payoutCents = 0; }
  }
  return s;
}

export function startBlackjack(betCents: number): BjState {
  if (!Number.isInteger(betCents) || betCents < 100 || betCents > 5_000_00) {
    throw new Error("bet must be between $1.00 and $5,000.00");
  }
  const s: BjState = {
    id: newId(),
    shoe: shuffle(shoe(6)),
    discard: 0,
    playerHands: [{ cards: [], betCents, stood: false, doubled: false, bust: false }],
    active: 0,
    dealer: [],
    insuranceCents: 0,
    insuranceOffered: false,
    insuranceResolved: false,
    canSplit: false,
    phase: "play",
  };
  s.playerHands[0]!.cards.push(draw(s), draw(s));
  s.dealer.push(draw(s), draw(s));
  s.canSplit = isPair(s.playerHands[0]!.cards);

  const pBj = isBlackjack(s.playerHands[0]!.cards);
  const dBj = isBlackjack(s.dealer);
  const dealerAce = s.dealer[0]!.rank === 1;

  if (dealerAce && !pBj) {
    s.phase = "insurance";
    s.insuranceOffered = true;
    return s;
  }
  if (pBj || dBj) {
    settleNaturals(s);
  }
  return s;
}

function settleNaturals(s: BjState) {
  const pBj = isBlackjack(s.playerHands[0]!.cards);
  const dBj = isBlackjack(s.dealer);
  s.phase = "settled";
  if (pBj && dBj) {
    s.result = "push";
    s.payoutCents = s.playerHands[0]!.betCents; // return stake
  } else if (pBj) {
    s.result = "blackjack";
    s.payoutCents = s.playerHands[0]!.betCents + Math.floor(s.playerHands[0]!.betCents * 3 / 2);
  } else {
    s.result = "dealer blackjack";
    s.payoutCents = 0;
  }
}

export function takeInsurance(s: BjState, take: boolean): BjState {
  if (s.phase !== "insurance") throw new Error("insurance not offered");
  if (take) {
    const prem = Math.floor(s.playerHands[0]!.betCents / 2);
    s.insuranceCents = prem;
  }
  s.insuranceResolved = true;
  const dBj = isBlackjack(s.dealer);
  if (dBj) {
    s.phase = "settled";
    s.result = take ? "insurance wins, dealer blackjack" : "dealer blackjack";
    // insurance pays 2:1 plus we do not return the main bet
    s.payoutCents = take ? s.insuranceCents * 3 : 0;
    return s;
  }
  // insurance lost (already debited). Continue play. Naturals already handled if player BJ.
  if (isBlackjack(s.playerHands[0]!.cards)) {
    settleNaturals(s);
    return s;
  }
  s.phase = "play";
  return s;
}

function current(s: BjState): BjHand {
  const h = s.playerHands[s.active];
  if (!h) throw new Error("no active hand");
  return h;
}

function maybeAdvance(s: BjState) {
  while (s.active < s.playerHands.length && (current(s).stood || current(s).bust)) {
    s.active += 1;
    if (s.active < s.playerHands.length) break;
  }
  if (s.playerHands.every((h) => h.stood || h.bust)) {
    playDealer(s);
  }
}

function playDealer(s: BjState) {
  s.phase = "dealer";
  const anyLive = s.playerHands.some((h) => !h.bust);
  if (anyLive) {
    while (true) {
      const v = handValue(s.dealer);
      if (v.total > 21) break;
      if (v.total > 17) break;
      if (v.total === 17 && !v.soft) break; // stand on soft 17? rules: dealer stands on soft 17
      if (v.total === 17 && v.soft) break; // S17
      if (v.total < 17) {
        s.dealer.push(draw(s));
        continue;
      }
      break;
    }
  }
  settle(s);
}

function settle(s: BjState) {
  s.phase = "settled";
  const dv = handValue(s.dealer);
  let pay = 0;
  const parts: string[] = [];
  for (const h of s.playerHands) {
    const pv = handValue(h.cards);
    if (h.bust) {
      parts.push("bust");
      continue;
    }
    if (isBlackjack(h.cards) && s.playerHands.length === 1) {
      pay += h.betCents + Math.floor(h.betCents * 3 / 2);
      parts.push("blackjack");
      continue;
    }
    if (dv.total > 21) {
      pay += h.betCents * 2;
      parts.push("dealer bust");
    } else if (pv.total > dv.total) {
      pay += h.betCents * 2;
      parts.push("win");
    } else if (pv.total === dv.total) {
      pay += h.betCents;
      parts.push("push");
    } else {
      parts.push("lose");
    }
  }
  // insurance already settled separately when dealer had BJ; if we got here insurance lost
  s.payoutCents = pay;
  s.result = parts.join(" / ");
}

export function hit(s: BjState): BjState {
  if (s.phase !== "play") throw new Error("not your action");
  const h = current(s);
  if (h.stood || h.doubled) throw new Error("hand is done");
  h.cards.push(draw(s));
  const v = handValue(h.cards);
  if (v.total > 21) {
    h.bust = true;
    h.stood = true;
  }
  if (v.total === 21) h.stood = true;
  s.canSplit = false;
  maybeAdvance(s);
  return s;
}

export function stand(s: BjState): BjState {
  if (s.phase !== "play") throw new Error("not your action");
  current(s).stood = true;
  maybeAdvance(s);
  return s;
}

export function double(s: BjState): { state: BjState; extraBet: number } {
  if (s.phase !== "play") throw new Error("not your action");
  const h = current(s);
  if (h.cards.length !== 2 || h.doubled) throw new Error("can only double two-card hands");
  const extra = h.betCents;
  h.betCents += extra;
  h.doubled = true;
  h.cards.push(draw(s));
  const v = handValue(h.cards);
  if (v.total > 21) h.bust = true;
  h.stood = true;
  s.canSplit = false;
  maybeAdvance(s);
  return { state: s, extraBet: extra };
}

export function split(s: BjState): { state: BjState; extraBet: number } {
  if (s.phase !== "play") throw new Error("not your action");
  if (s.playerHands.length !== 1) throw new Error("split once only");
  const h = current(s);
  if (!isPair(h.cards)) throw new Error("not a pair");
  const extra = h.betCents;
  const c2 = h.cards.pop()!;
  const h2: BjHand = { cards: [c2], betCents: extra, stood: false, doubled: false, bust: false };
  h.cards.push(draw(s));
  h2.cards.push(draw(s));
  s.playerHands.push(h2);
  s.canSplit = false;
  // split aces: one card each, then stand
  if (h.cards[0]!.rank === 1) {
    h.stood = true;
    h2.stood = true;
    maybeAdvance(s);
  }
  return { state: s, extraBet: extra };
}

export function publicBlackjack(s: BjState, revealDealer: boolean) {
  const hideHole = !revealDealer && s.phase !== "settled" && s.phase !== "dealer";
  return {
    id: s.id,
    phase: s.phase,
    result: s.result ?? null,
    payoutCents: s.phase === "settled" ? s.payoutCents ?? 0 : null,
    insuranceOffered: s.phase === "insurance",
    insuranceCents: s.insuranceCents,
    canSplit: s.canSplit && s.phase === "play" && s.playerHands.length === 1,
    canDouble: s.phase === "play" && currentSafe(s)?.cards.length === 2 && !currentSafe(s)?.doubled,
    active: s.active,
    playerHands: s.playerHands.map((h) => ({
      cards: h.cards.map(cardPublic),
      betCents: h.betCents,
      stood: h.stood,
      doubled: h.doubled,
      bust: h.bust,
      value: handValue(h.cards),
    })),
    dealer: {
      cards: s.dealer.map((c, i) => (hideHole && i === 1 ? { id: "??", rank: "?", suit: "s", joker: false, red: false } : cardPublic(c))),
      value: hideHole ? null : handValue(s.dealer),
    },
  };
}

function currentSafe(s: BjState): BjHand | undefined {
  return s.playerHands[s.active];
}
