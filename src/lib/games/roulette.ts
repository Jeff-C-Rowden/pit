import { randInt, newId } from "../rng";

export const WHEEL: string[] = [
  "0", "28", "9", "26", "30", "11", "7", "20", "32", "17", "5", "22", "34", "15", "3", "24", "36", "13", "1",
  "00", "27", "10", "25", "29", "12", "8", "19", "31", "18", "6", "21", "33", "16", "4", "23", "35", "14", "2",
];

export const RED = new Set(["1","3","5","7","9","12","14","16","18","19","21","23","25","27","30","32","34","36"]);
export const BLACK = new Set(["2","4","6","8","10","11","13","15","17","20","22","24","26","28","29","31","33","35"]);

export type BetKind =
  | "straight"
  | "split"
  | "street"
  | "corner"
  | "five"
  | "six"
  | "dozen"
  | "column"
  | "red"
  | "black"
  | "even"
  | "odd"
  | "low"
  | "high";

export type RouletteBet = { kind: BetKind; numbers: string[]; amountCents: number };

const PAY: Record<BetKind, number> = {
  straight: 35,
  split: 17,
  street: 11,
  corner: 8,
  five: 6,
  six: 5,
  dozen: 2,
  column: 2,
  red: 1,
  black: 1,
  even: 1,
  odd: 1,
  low: 1,
  high: 1,
};

function nset(nums: number[]): string[] {
  return nums.map(String);
}

export function validateBet(b: RouletteBet): void {
  if (!Number.isInteger(b.amountCents) || b.amountCents < 25) throw new Error("minimum chip is $0.25");
  const k = b.kind;
  const n = b.numbers;
  const ok = (pred: boolean) => { if (!pred) throw new Error(`invalid ${k} bet`); };
  if (k === "straight") ok(n.length === 1 && WHEEL.includes(n[0]!));
  else if (k === "split") ok(n.length === 2 && n.every((x) => WHEEL.includes(x)));
  else if (k === "street") ok(n.length === 3);
  else if (k === "corner") ok(n.length === 4);
  else if (k === "five") ok(n.length === 5);
  else if (k === "six") ok(n.length === 6);
  else if (k === "dozen") ok(n.length === 12);
  else if (k === "column") ok(n.length === 12);
  else if (k === "red") { b.numbers = [...RED]; }
  else if (k === "black") { b.numbers = [...BLACK]; }
  else if (k === "even") { b.numbers = WHEEL.filter((x) => x !== "0" && x !== "00" && Number(x) % 2 === 0); }
  else if (k === "odd") { b.numbers = WHEEL.filter((x) => x !== "0" && x !== "00" && Number(x) % 2 === 1); }
  else if (k === "low") { b.numbers = nset(range(1, 18)); }
  else if (k === "high") { b.numbers = nset(range(19, 36)); }
}

function range(a: number, b: number) {
  const o: number[] = [];
  for (let i = a; i <= b; i++) o.push(i);
  return o;
}

export function dozen(which: 1 | 2 | 3): string[] {
  const start = (which - 1) * 12 + 1;
  return nset(range(start, start + 11));
}

export function column(which: 1 | 2 | 3): string[] {
  const o: string[] = [];
  for (let i = which; i <= 36; i += 3) o.push(String(i));
  return o;
}

export function spinAmerican(): string {
  return WHEEL[randInt(WHEEL.length)]!;
}

export function settleRoulette(bets: RouletteBet[], pocket: string) {
  let payout = 0;
  const details: { bet: RouletteBet; win: boolean; payoutCents: number }[] = [];
  for (const bet of bets) {
    const hit = bet.numbers.includes(pocket);
    const pay = hit ? bet.amountCents * (PAY[bet.kind] + 1) : 0; // includes stake
    payout += pay;
    details.push({ bet, win: hit, payoutCents: pay });
  }
  return { payoutCents: payout, details, pocket };
}

export function publicWheel() {
  return {
    pockets: WHEEL,
    red: [...RED],
    black: [...BLACK],
    payouts: PAY,
    houseEdge: "American double-zero roulette house edge is 5.26% (2.63% on five-number). RTP on standard bets is 94.74%.",
  };
}

export { PAY, nset, range, newId };
