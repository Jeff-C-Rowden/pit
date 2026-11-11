/**
 * Monte Carlo through the real server game functions with the seeded audit RNG.
 * Usage: node mc.mjs <game> <rounds> [arg]   (seed from AUDIT_SEED)
 * Prints one JSON line: { game, seed, rounds, wagered, returned, sumX2, sumY2, sumXY }.
 */
import { spinSlot } from "../src/lib/games/slot";
import { spinVaultSpire } from "../src/lib/games/slotProgressive";
import { applyProgressiveSpin, ensureAllTiers } from "../src/lib/progressive";
import { spinAmerican, settleRoulette, validateBet, dozen, column, type RouletteBet } from "../src/lib/games/roulette";
import { newCrapsTable, applyBet, rollDice, resolveRoll, type CrapsState, type PlaceAction } from "../src/lib/games/craps";
import { startBlackjack, takeInsurance, hit, stand, double, split, type BjState } from "../src/lib/games/blackjack";
import { startHoldem, playerAct, bestHand, type HoldemState, type PlayerAction, BB } from "../src/lib/games/holdem";
import { startPaiGow, setHouseWayPlayer } from "../src/lib/games/paigow";
import { spinBuckshot } from "./snapshots/games/buckshot";
import { blackjackValue } from "../src/lib/games/cards";

const [game, roundsS, arg] = process.argv.slice(2);
const N = Number(roundsS);
let W = 0, R = 0, WW = 0, RR = 0, WR = 0, n = 0;
const extra: Record<string, number> = {};
let HITS = 0, WINS = 0;
function rec(w: number, r: number) { W += w; R += r; WW += w * w; RR += r * r; WR += w * r; n++; if (r > 0) HITS++; if (r > w) WINS++; }

// ---------------- blackjack basic strategy: 6D, S17, DAS, split once, no surrender ----------------
const up = (s: BjState) => { const r = s.dealer[0]!.rank; return r === 1 ? 11 : r >= 10 ? 10 : r; };
const cv = (r: number) => (r === 1 ? 11 : r >= 10 ? 10 : r);
function bjAction(s: BjState): "H" | "S" | "D" | "P" {
  const h = s.playerHands[s.active]!; const d = up(s);
  const two = h.cards.length === 2; const canSplit = two && s.playerHands.length === 1 && cv(h.cards[0]!.rank) === cv(h.cards[1]!.rank);
  if (canSplit) {
    const p = cv(h.cards[0]!.rank);
    if (p === 11 || p === 8) return "P";
    if (p === 9 && ![7, 10, 11].includes(d)) return "P";
    if (p === 7 && d <= 7) return "P";
    if (p === 6 && d <= 6) return "P";
    if (p === 4 && (d === 5 || d === 6)) return "P";
    if ((p === 2 || p === 3) && d <= 7) return "P";
  }
  const v = blackjackValue(h.cards);
  if (v.soft) {
    const x = v.total - 11; // other card(s)
    if (x >= 8) return "S";
    if (x === 7) { if (d >= 3 && d <= 6) return two ? "D" : "S"; if (d === 2 || d === 7 || d === 8) return "S"; return "H"; }
    if (x === 6 && d >= 3 && d <= 6) return two ? "D" : "H";
    if ((x === 4 || x === 5) && d >= 4 && d <= 6) return two ? "D" : "H";
    if ((x === 2 || x === 3) && d >= 5 && d <= 6) return two ? "D" : "H";
    return "H";
  }
  const t = v.total;
  if (t >= 17) return "S";
  if (t >= 13) return d <= 6 ? "S" : "H";
  if (t === 12) return d >= 4 && d <= 6 ? "S" : "H";
  if (t === 11) return d <= 10 ? (two ? "D" : "H") : "H";
  if (t === 10) return d <= 9 ? (two ? "D" : "H") : "H";
  if (t === 9) return d >= 3 && d <= 6 ? (two ? "D" : "H") : "H";
  return "H";
}

// ---------------- hold'em player strategies ----------------
const RA = (r: number) => (r === 1 ? 14 : r);
function holeStrength(hole: { rank: number; suit: string }[]): number {
  const a = RA(hole[0]!.rank), b = RA(hole[1]!.rank); const hi = Math.max(a, b), lo = Math.min(a, b);
  let s: number; if (a === b) s = 0.55 + hi / 28; else { s = (hi + lo / 2) / 21; if (hole[0]!.suit === hole[1]!.suit) s += 0.05; if (hi - lo <= 2) s += 0.04; }
  return Math.min(0.99, s);
}
function handScore(hole: any[], board: any[]) { const e = bestHand(hole, board); return Math.min(0.99, (e.cat + 1) / 9 + (e.kickers[0] || 0) / 140); }
let u01 = () => 0; // set below
function heAction(s: HoldemState, strat: string, raises: { n: number; street: string }): PlayerAction {
  const toCall = s.currentBet - s.playerBet;
  if (raises.street !== s.street) { raises.street = s.street; raises.n = 0; }
  if (strat === "station") return toCall > 0 ? { type: "call" } : { type: "check" };
  if (strat === "aggro") {
    if (raises.n < 2) { raises.n++; const to = s.currentBet === 0 ? Math.max(BB, s.pot) : s.currentBet + Math.max(s.lastRaise, s.pot); return { type: s.currentBet === 0 ? "bet" : "raise", amountCents: to }; }
    return toCall > 0 ? { type: "call" } : { type: "check" };
  }
  // "mirror": the house bot's own heuristic played from the player's seat
  const hs = s.board.length >= 3 ? handScore(s.playerHole, s.board) : holeStrength(s.playerHole);
  const r = () => Math.floor(u01() * 100);
  if (toCall === 0) {
    if (hs > 0.72 && r() < 70) return { type: "bet", amountCents: Math.max(BB, Math.floor(s.pot * 0.6)) };
    if (hs > 0.55 && r() < 35) return { type: "bet", amountCents: Math.max(BB, Math.floor(s.pot * 0.45)) };
    return { type: "check" };
  }
  const potOdds = toCall / (s.pot + toCall);
  if (hs < 0.28 && potOdds > 0.2) return { type: "fold" };
  if (hs > 0.78 && r() < 55 && raises.n < 3) { raises.n++; return { type: "raise", amountCents: s.currentBet + Math.max(s.lastRaise, Math.floor(s.pot * 0.7)) }; }
  if (hs + 0.08 >= potOdds) return { type: "call" };
  return { type: "fold" };
}

// ---------------- craps single-bet scenarios ----------------
function crapsScenario(name: string): { place: (s: CrapsState) => number } {
  const tryBet = (s: CrapsState, a: PlaceAction) => { try { return applyBet(s, a); } catch { return 0; } };
  const U = 600;
  switch (name) {
    case "pass": return { place: (s) => (s.point == null && !s.pass ? tryBet(s, { type: "pass", amount: U }) : 0) };
    case "dontPass": return { place: (s) => (s.point == null && !s.dontPass ? tryBet(s, { type: "dontPass", amount: U }) : 0) };
    case "pass2xOdds": return { place: (s) => {
      let w = 0; if (s.point == null && !s.pass) w += tryBet(s, { type: "pass", amount: U });
      if (s.point != null && s.pass && !s.passOdds) w += tryBet(s, { type: "passOdds", amount: 2 * U }); return w; } };
    case "place6": case "place5": case "place4": { const num = Number(name.slice(5)) as 4 | 5 | 6;
      return { place: (s) => (s.point != null && !s.place[String(num)] ? tryBet(s, { type: "place", number: num, amount: U }) : 0) }; }
    case "field": return { place: (s) => tryBet(s, { type: "field", amount: U }) };
    case "anySeven": return { place: (s) => tryBet(s, { type: "anySeven", amount: U }) };
    case "anyCraps": return { place: (s) => tryBet(s, { type: "anyCraps", amount: U }) };
    case "yo": return { place: (s) => tryBet(s, { type: "yo", amount: U }) };
    case "hard6": return { place: (s) => (!s.hard["6"] ? tryBet(s, { type: "hard", number: 6, amount: U }) : 0) };
    case "hard4": return { place: (s) => (!s.hard["4"] ? tryBet(s, { type: "hard", number: 4, amount: U }) : 0) };
    case "come": return { place: (s) => (s.point != null && s.come.length === 0 ? tryBet(s, { type: "come", amount: U }) : 0) };
    case "dontCome": return { place: (s) => (s.point != null && s.dontCome.length === 0 ? tryBet(s, { type: "dontCome", amount: U }) : 0) };
  }
  throw new Error("unknown craps scenario " + name);
}
function takeDown(s: CrapsState) {
  s.pass = 0; s.passOdds = 0; s.dontPass = 0; s.dontPassOdds = 0; s.field = 0; s.anySeven = 0; s.anyCraps = 0; s.yo = 0;
  for (const k of Object.keys(s.place)) s.place[k] = 0; for (const k of Object.keys(s.hard)) s.hard[k] = 0; s.come = []; s.dontCome = [];
}
function feltStake(s: CrapsState) {
  return s.pass + s.passOdds + s.dontPass + s.dontPassOdds + s.field + s.anySeven + s.anyCraps + s.yo +
    Object.values(s.place).reduce((a, b) => a + b, 0) + Object.values(s.hard).reduce((a, b) => a + b, 0) +
    s.come.reduce((a, c) => a + c.amount + c.odds, 0) + s.dontCome.reduce((a, c) => a + c.amount + c.odds, 0);
}

const { rand01 } = await import("./seededRng");
u01 = rand01;

if (game === "gilded") {
  const coin = Number(arg ?? 25);
  for (let i = 0; i < N; i++) { const r = spinSlot(coin); rec(r.betCents, r.winCents); }
} else if (game === "canopyLine") {
  const coin = Number(arg ?? 25);
  for (let i = 0; i < N; i++) { const r = spinVaultSpire(coin); rec(r.betCents, r.lineWinCents); }
} else if (game === "canopyFull") {
  const Database = (await import("better-sqlite3")).default;
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE progressive_meters (id TEXT PRIMARY KEY, amount_cents INTEGER NOT NULL, seed_cents INTEGER NOT NULL, contribution_bps INTEGER NOT NULL, ceiling_cents INTEGER, trigger_cents INTEGER, last_hit_at TEXT, updated_at TEXT NOT NULL);`);
  ensureAllTiers(db);
  db.exec("DROP INDEX IF EXISTS idx_progressive_hits_at");
  const coin = Number(arg ?? 25);
  let line = 0, prog = 0, seedPaid = 0, hits: Record<string, number> = {};
  // Long run starts on a fresh reseed; the warm-up below discards the start-up transient.
  const warm = Math.floor(N / 20);
  for (let i = 0; i < N + warm; i++) {
    const r = spinVaultSpire(coin);
    const p = applyProgressiveSpin({ contributionByTier: r.contributionByTier, userId: null, betCents: r.betCents }, db);
    if (i % 50000 === 0) db.exec("DELETE FROM progressive_hits");
    if (i < warm) continue;
    rec(r.betCents, r.lineWinCents + p.progressiveAwardCents);
    line += r.lineWinCents; prog += p.progressiveAwardCents;
    for (const h of p.hits) { hits[h.name] = (hits[h.name] ?? 0) + 1; seedPaid += h.reseedsTo; }
  }
  Object.assign(extra, { line, prog, seedPaid, ...Object.fromEntries(Object.entries(hits).map(([k, v]) => ["hits" + k, v])) });
} else if (game === "buckshot") {
  const coins = Number(arg ?? 1);
  for (let i = 0; i < N; i++) { const r = spinBuckshot(coins, 25); rec(r.betCents, r.winCents); }
} else if (game === "roulette") {
  const kinds: [RouletteBet["kind"], string[]][] = [["straight", ["17"]], ["split", ["0", "00"]], ["street", ["1", "2", "3"]], ["corner", ["1", "2", "4", "5"]], ["six", ["31", "32", "33", "34", "35", "36"]], ["dozen", dozen(2)], ["column", column(3)], ["red", []], ["odd", []], ["high", []]];
  const k = kinds.find(([x]) => x === arg) ?? kinds[0]!;
  for (let i = 0; i < N; i++) { const b: RouletteBet = { kind: k[0], numbers: k[1].slice(), amountCents: 100 }; validateBet(b); rec(100, settleRoulette([b], spinAmerican()).payoutCents); }
} else if (game === "craps") {
  const sc = crapsScenario(arg!); const s = newCrapsTable();
  let wag = 0, ret = 0;
  for (let i = 0; i < N; i++) {
    const w = sc.place(s); wag += w;
    const r = resolveRoll(s, rollDice()); ret += r.payoutCents;
    s.log.length = 0;
    // One decision per wager: when a bet wins and "stays up", take it down so the next
    // decision is a fresh wager (otherwise one placement would ride many decisions).
    let back = 0;
    if (r.payoutCents > 0) { back = feltStake(s); takeDown(s); }
    rec(w, r.payoutCents + back); // per-roll pairs; CI uses batch means across seeds
  }
  ret += feltStake(s); // chips still on the felt are the player's
  extra.feltAtEnd = feltStake(s); R += feltStake(s);
} else if (game === "blackjack") {
  for (let i = 0; i < N; i++) {
    let s = startBlackjack(1000); let wag = 1000;
    if (s.phase === "insurance") s = takeInsurance(s, false);
    let guard = 0;
    while (s.phase === "play" && guard++ < 30) {
      const a = bjAction(s);
      if (a === "P") { const r = split(s); wag += r.extraBet; s = r.state; }
      else if (a === "D") { const r = double(s); wag += r.extraBet; s = r.state; }
      else if (a === "H") s = hit(s); else s = stand(s);
    }
    if (s.phase !== "settled") throw new Error("unsettled hand " + s.phase);
    rec(wag, s.payoutCents ?? 0);
  }
} else if (game === "holdem") {
  const strat = arg ?? "station";
  for (let i = 0; i < N; i++) {
    const { state: s, playerBlind } = startHoldem(i % 2 === 0);
    let wag = playerBlind; const raises = { n: 0, street: "" }; let guard = 0;
    while (s.toAct === "player" && s.street !== "showdown" && s.street !== "folded" && guard++ < 40) {
      let a = heAction(s, strat, raises);
      try { wag += playerAct(s, a).extraDebit; } catch { a = s.currentBet - s.playerBet > 0 ? { type: "call" } : { type: "check" }; wag += playerAct(s, a).extraDebit; }
    }
    if (s.street !== "showdown" && s.street !== "folded") {
      // Server bug: house folds its small blind inside startHoldem and closeIfFolded never runs,
      // so the hand is left open with toAct "none". Scored here as the intended result (player takes the pot).
      if (!s.houseFolded) {
        extra.stuckOther = (extra.stuckOther ?? 0) + 1;
        if ((extra.stuckOther as number) <= 2) console.error("STUCK", JSON.stringify({ street: s.street, toAct: s.toAct, cb: s.currentBet, pb: s.playerBet, hb: s.houseBet, lr: s.lastRaise, pot: s.pot, log: s.log.slice(-8) }));
        rec(wag, 0); continue;
      }
      extra.stuckHouseFoldAtDeal = (extra.stuckHouseFoldAtDeal ?? 0) + 1; rec(wag, s.pot); continue;
    }
    rec(wag, s.payoutCents ?? 0);
  }
} else if (game === "paigow") {
  for (let i = 0; i < N; i++) { const s = setHouseWayPlayer(startPaiGow(1000)); rec(1000, s.payoutCents ?? 0); }
} else throw new Error("unknown game " + game);

console.log(JSON.stringify({ game, arg: arg ?? null, seed: Number(process.env.AUDIT_SEED ?? 1), rounds: n, hits: HITS, wins: WINS, wagered: W, returned: R, WW, RR, WR, ...extra }));
