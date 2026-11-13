/**
 * #11 Guest demo spin: one real Buckshot Bars spin for a signed-out (21+-confirmed) visitor.
 *
 * Honest by construction:
 * - The outcome uses the exact same reel strips, window and paytable evaluation as the
 *   server spin (BB_REELS / windowFor / evaluateBuckshot from src/lib/games/buckshot.ts),
 *   with every stop picked uniformly at random by the browser CSPRNG. Nothing is weighted,
 *   no first-spin win, no near-miss staging.
 * - Demo chips live only in this browser tab (sessionStorage). This module never imports
 *   the database, the ledger or the API client, and makes no network call; nothing about
 *   the demo is sent to or stored on the server.
 */
import { BB_REELS, BB_TABLE, evaluateBuckshot, validateBuckshotBet, windowFor, type BbSymbol } from "./games/buckshot";
import { BUCKSHOT_MATH } from "./gameMath";

export const DEMO_LABEL = "Demo spin · sandbox chips · no cash value";
/** Demo stack held only in the browser. */
export const DEMO_START_CENTS = 1000;
/** Three coins (the best-paying way to play) at a 25¢ coin: a $0.75 spin. */
export const DEMO_COINS = 3;
export const DEMO_DENOM_CENTS = 25;
export const DEMO_SPINS = 1;
export const DEMO_STORAGE_KEY = "pit_demo_spin_v1";
/** Published RTP for the way the demo is played (3 coins), from the exact enumeration. */
export const DEMO_RTP_LINE = `Buckshot Bars RTP ${(BUCKSHOT_MATH.rtp3 * 100).toFixed(2)}% at 3 coins · about 1 spin in ${(1 / BUCKSHOT_MATH.hitRate).toFixed(1)} pays something`;

export type DemoSpin = {
  window: BbSymbol[][];
  line: BbSymbol[];
  stops: number[];
  coins: number;
  denomCents: number;
  betCents: number;
  payCoins: number;
  kind: string;
  winCents: number;
};

export type DemoState = { balanceCents: number; spinsLeft: number; last: DemoSpin | null };

export const freshDemo = (): DemoState => ({ balanceCents: DEMO_START_CENTS, spinsLeft: DEMO_SPINS, last: null });

/** Uniform integer in [0, n) from a 32-bit random source, with rejection sampling (no modulo bias). */
export function uniformPick(n: number, rand32: () => number): number {
  if (!Number.isInteger(n) || n <= 0 || n > 2 ** 32) throw new Error("n must be a positive integer");
  const limit = Math.floor(2 ** 32 / n) * n;
  for (;;) {
    const x = rand32() >>> 0;
    if (x < limit) return x % n;
  }
}

/** The browser CSPRNG (window.crypto.getRandomValues). */
export function browserRand32(): number {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0]!;
}

/** One demo spin with the real strips and paytable. `pick(n)` must be uniform in [0, n). */
export function demoBuckshotSpin(pick: (n: number) => number = (n) => uniformPick(n, browserRand32)): DemoSpin {
  const { coins, denomCents, betCents } = validateBuckshotBet(DEMO_COINS, DEMO_DENOM_CENTS);
  const stops = BB_REELS.map((strip) => pick(strip.length));
  const window = windowFor(stops);
  const line = window.map((w) => w[1]!);
  const ev = evaluateBuckshot(line, coins, BB_TABLE);
  return { window, line, stops, coins, denomCents, betCents, payCoins: ev.pay, kind: ev.kind, winCents: ev.pay * denomCents };
}

/** Apply a spin to the browser-only demo stack. Refuses once the free demo spin is used. */
export function playDemo(state: DemoState, pick?: (n: number) => number): DemoState {
  if (state.spinsLeft <= 0) throw new Error("demo spin used: sign up to keep playing");
  const s = demoBuckshotSpin(pick);
  if (state.balanceCents < s.betCents) throw new Error("not enough demo chips");
  return { balanceCents: state.balanceCents - s.betCents + s.winCents, spinsLeft: state.spinsLeft - 1, last: s };
}

const KIND_WORDS: Record<string, string> = { SEVEN: "7s", BAR3: "triple bars", BAR2: "double bars", BAR1: "single bars" };
/** "THREE BAR3" -> "Three triple bars", "2 CHERRIES" -> "2 cherries". */
export function demoKindLabel(kind: string): string {
  const t = kind.replace(/^THREE (\w+)$/, (_, k: string) => `three ${KIND_WORDS[k] ?? k.toLowerCase()}`).toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Plain-language result line; no hype, true minus sign on a loss. */
export function demoResultLine(s: DemoSpin, money: (c: number) => string): string {
  if (s.winCents === 0) return `No win this spin · net −${money(s.betCents)}. Most spins don’t pay; the RTP is the long-run average.`;
  const net = s.winCents - s.betCents;
  const netText = net === 0 ? money(0) : net > 0 ? `+${money(net)}` : `−${money(-net)}`;
  return `${demoKindLabel(s.kind)} pays ${money(s.winCents)} on a ${money(s.betCents)} spin · net ${netText}.`;
}

/** Read the tab-only demo stack; anything malformed starts fresh. */
export function loadDemo(store: Pick<Storage, "getItem"> | null | undefined): DemoState {
  try {
    const raw = store?.getItem(DEMO_STORAGE_KEY);
    if (!raw) return freshDemo();
    const d = JSON.parse(raw);
    if (typeof d?.balanceCents !== "number" || typeof d?.spinsLeft !== "number") return freshDemo();
    return { balanceCents: d.balanceCents, spinsLeft: Math.max(0, Math.min(DEMO_SPINS, d.spinsLeft)), last: d.last ?? null };
  } catch {
    return freshDemo();
  }
}

export function saveDemo(store: Pick<Storage, "setItem"> | null | undefined, s: DemoState) {
  try { store?.setItem(DEMO_STORAGE_KEY, JSON.stringify(s)); } catch { /* private mode: state stays in memory */ }
}
