// Tactile feedback: how big a result effect should be, plus soft synthesized sounds.
// Effects follow the real settled result only. Losses, pushes and wins smaller than the
// stake never celebrate. Sound & feel stay off by default (localStorage pit.sound !== "on")
// and are remembered per device. Buzz never fires when feel is off or reduced-motion is on.

export type FeelLevel = 0 | 1 | 2 | 3;

/**
 * returnCents = total paid back (stake included). stakeCents = what was risked.
 * 0: no celebration (loss, push, profit below the stake, or stake unknown)
 * 1: profit at least the stake (even money and up)
 * 2: profit at least 5x the stake
 * 3: profit at least 20x the stake
 */
export function celebrationLevel(stakeCents: number | null | undefined, returnCents: number | null | undefined): FeelLevel {
  const stake = Number(stakeCents) || 0;
  const ret = Number(returnCents) || 0;
  if (stake <= 0 || ret <= stake) return 0;
  const profit = ret - stake;
  if (profit >= stake * 20) return 3;
  if (profit >= stake * 5) return 2;
  if (profit >= stake) return 1;
  return 0;
}

/** Chips slide to the player whenever real money comes back on a win. */
export function shouldSlidePayout(tone: "win" | "loss" | "push", returnCents: number | null | undefined): boolean {
  return tone === "win" && (Number(returnCents) || 0) > 0;
}

const KEY = "pit.sound";
export function soundOn(): boolean {
  try { return typeof window !== "undefined" && window.localStorage.getItem(KEY) === "on"; } catch { return false; }
}
export function setSoundOn(on: boolean) {
  try { window.localStorage.setItem(KEY, on ? "on" : "off"); } catch {}
  window.dispatchEvent(new Event("pit-sound"));
}
export function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (!soundOn() || typeof window === "undefined") return null;
  const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  ctx = ctx || new C();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(c: AudioContext, freq: number, at: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime + at);
  g.gain.setValueAtTime(0.0001, c.currentTime + at);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + dur);
  o.connect(g).connect(c.destination); o.start(c.currentTime + at); o.stop(c.currentTime + at + dur + 0.02);
}

function clack(c: AudioContext, at: number, gain = 0.12) {
  // Short filtered noise burst: clay chip on felt.
  const len = Math.floor(c.sampleRate * 0.035);
  const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2400; f.Q.value = 1.2;
  const g = c.createGain(); g.gain.value = gain;
  s.connect(f).connect(g).connect(c.destination); s.start(c.currentTime + at);
}

/** One chip placed. */
let lastChipAt = 0;
export function playChip() {
  const now = Date.now(); if (now - lastChipAt < 150) return; lastChipAt = now;
  buzz(vibratePattern("chip")); const c = ac(); if (c) clack(c, 0);
}

/** Chips paid to the player; size follows the level. Never called for losses. */
export function playPayout(level: FeelLevel) {
  buzz(vibratePattern("pay", level));
  const c = ac(); if (!c) return;
  const clacks = [2, 3, 4, 5][level];
  for (let i = 0; i < clacks; i++) clack(c, i * 0.06, 0.09);
  if (level >= 1) {
    const notes = [[660], [660, 880], [660, 880, 1100], [660, 880, 1100, 1320]][level];
    notes.forEach((f, i) => tone(c, f, 0.12 + i * 0.09, 0.35, 0.05, "triangle"));
  }
}

/** Soft kick when a spin / roll actually starts (not Stop). Gated like every other buzz. */
export function playSpin() {
  buzz(vibratePattern("spin"));
  const c = ac(); if (!c) return;
  clack(c, 0, 0.06);
  tone(c, 220, 0, 0.05, 0.025, "triangle");
}

/** Feature trigger fanfare (free spins / Mine Cart). Gated like every other sound and buzz. */
export function playFeature() {
  buzz([20, 40, 20, 40, 60]);
  const c = ac(); if (!c) return;
  [523, 659, 784, 1047].forEach((f, i) => tone(c, f, i * 0.1, 0.3, 0.05, "triangle"));
}

/** Soft kick when a deal actually starts. Gated like every other buzz. */
export function playDeal() {
  buzz(vibratePattern("deal"));
  const c = ac(); if (!c) return;
  clack(c, 0, 0.05);
  tone(c, 330, 0.01, 0.04, 0.02, "sine");
}

/** Total chips the player had riding on a craps roll (from the layout snapshot). */
export function crapsRiskedCents(pattern: { amount?: number }[] | null | undefined): number {
  return (pattern || []).reduce((n, b) => n + Math.max(0, Number(b.amount) || 0), 0);
}

/** Total the player put in a Hold'em pot, as reported by the server. */
export function holdemRiskedCents(game: { playerCommittedCents?: number } | null | undefined): number {
  return Math.max(0, Number(game?.playerCommittedCents) || 0);
}

/** Vibration patterns (ms). Same scaling as the visuals: nothing for level-0 pay results. */
export function vibratePattern(kind: "chip" | "pay" | "spin" | "deal", level: FeelLevel = 0): number[] {
  if (kind === "chip") return [8];
  if (kind === "spin") return [12, 30, 8];
  if (kind === "deal") return [10, 24, 10];
  return [[], [18], [18, 50, 18], [24, 50, 24, 50, 48]][level];
}

/** Buzz only when the feel setting is on, motion is allowed and the phone supports it. */
export function buzz(pattern: number[]) {
  if (!pattern.length || !soundOn() || reducedMotion()) return;
  try { (navigator as Navigator & { vibrate?: (p: number[]) => boolean }).vibrate?.(pattern); } catch {}
}

const BJ_WORDS: Record<string, string> = {
  win: "You win", lose: "Dealer wins", push: "Push", blackjack: "Blackjack", bust: "Bust",
  "dealer bust": "Dealer busts", "dealer blackjack": "Dealer blackjack", "hand closed": "Hand closed",
  "insurance wins": "Insurance wins",
};
/** Turns the engine's result words ("dealer bust / lose") into a readable line ("Dealer busts · Dealer wins"). */
export function blackjackResultLabel(result: string | null | undefined): string {
  if (!result) return "";
  return result.split(/\s*[\/,]\s*/).filter(Boolean)
    .map((p) => BJ_WORDS[p] || p.charAt(0).toUpperCase() + p.slice(1)).join(" · ");
}

/** Short, honest headline for a Pai Gow result string. */
export function paigowResultLabel(result: string | null | undefined): string {
  const r = String(result || "");
  if (r.startsWith("win both")) return "You won both hands";
  if (r.startsWith("lose both")) return "Dealer won both hands";
  if (r.startsWith("push")) return "Push · one hand each";
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : "Settled";
}

const CRAPS_FELT_KEYS = ["pass", "passOdds", "dontPass", "dontPassOdds", "come", "dontCome", "place", "field", "anySeven", "anyCraps", "yo", "hard"] as const;
/** Total chips currently on the craps felt, from the server's public table. Nested come/place/hard boxes are summed. */
export function crapsFeltCents(table: Record<string, unknown> | null | undefined): number {
  const sum = (v: unknown): number =>
    typeof v === "number" ? Math.max(0, v) : Array.isArray(v) ? v.reduce((n: number, x) => n + sum(x), 0)
      : v && typeof v === "object" ? Object.values(v as object).reduce((n: number, x) => n + sum(x), 0) : 0;
  if (!table) return 0;
  return CRAPS_FELT_KEYS.reduce((n, k) => n + sum(table[k]), 0);
}

/** One-time "How to play in 10 seconds" tips, keyed by table. */
export type TableTip = { title: string; steps: string[]; odds: string };

/** Per-table "how to play" coach card. `odds` restates only what /rules publishes for that table. */
export const TABLE_TIPS: Record<string, TableTip> = {
  slot: { title: "Sundown Trail in 10 seconds", steps: ["Pick a coin size.", "Tap Spin. Each spin bets all 9 lines.", "Wins pay from the paytable below the reels."], odds: "Exact theoretical RTP 95.53%, so the house keeps about 4.5% of coin-in over time." },
  buckshot: { title: "Buckshot Bars in 10 seconds", steps: ["Pick a coin value with − and +.", "Bet one adds a coin (up to 3). Spin reels plays.", "Only the centre payline pays. The horseshoe is wild."], odds: "Exact RTP 94.44% at 1–2 coins and 94.67% at 3 coins, computed from the reel strips." },
  mine: { title: "Canary Creek Mine in 10 seconds", steps: ["Pick a coin size and tap Spin. Each spin bets all 9 lines.", "3 or more dynamite anywhere: 8, 12 or 20 free spins, every win doubled.", "A mine cart on reels 1, 3 and 5 opens the Mine Cart pick."], odds: "Exact theoretical RTP 95.42% with both features included (base game 72.45%, free spins 10.97%, Mine Cart 12.00%)." },
  prairie: { title: "Thunderhoof Prairie in 10 seconds", steps: ["Pick a coin size and tap Spin. Each spin is 10 coins across 243 ways.", "3 or more storm clouds: 8, 12 or 20 free spins where wilds carry 2× or 3×.", "6 or more gold coins: Hold & Spin. Coins lock, 3 respins, new coins reset them."], odds: "Exact theoretical RTP 95.25% with both features included (base game 58.52%, free spins 16.69%, Hold & Spin 20.04%)." },
  clover: { title: "Kettle of Clover in 10 seconds", steps: ["Pick a coin size and tap Spin. Each spin bets all 10 lines.", "3 or more kettles: 8, 10 or 15 free spins where clover wilds fill their reel.", "A rainbow on reels 1, 3 and 5 spins the Rainbow Wheel."], odds: "Exact theoretical RTP 95.35% with both features included (base game 65.45%, free spins 17.34%, Rainbow Wheel 12.57%)." },
  vault: { title: "Antler Ridge in 10 seconds", steps: ["Pick a coin size and tap Spin.", "A small part of every bet feeds the four jackpots.", "Jackpots are rare. Most spins pay nothing."], odds: "Exact theoretical RTP about 95% including the jackpots (89.2% base game). 3% of each bet feeds the meters." },
  roulette: { title: "Roulette in 10 seconds", steps: ["Pick a chip.", "Tap a spot on the table, like Red.", "Tap Spin. Red wins 18 of 38 spins and pays 1 to 1. Undo takes a chip back."], odds: "American wheel: house edge 5.26% (RTP 94.74%) on standard bets." },
  blackjack: { title: "Blackjack in 10 seconds", steps: ["Pick a chip and tap Deal.", "Get closer to 21 than the dealer without going over.", "Hit takes a card. Stand keeps your hand."], odds: "House edge about 0.4% with basic strategy, higher if you play by feel." },
  craps: { title: "Craps in 10 seconds", steps: ["Pick a chip and tap Pass line.", "Tap Roll. 7 or 11 wins now. 2, 3 or 12 loses.", "Any other number is the point: roll it again before a 7 to win."], odds: "Pass line house edge about 1.41%. Odds bets pay true odds. Props carry much higher edges." },
  holdem: { title: "Hold'em in 10 seconds", steps: ["Tap Deal. You post a blind and get two cards.", "Check, bet or fold as the five shared cards come out.", "Best five-card hand at showdown takes the pot."], odds: "Heads-up against the house bot with no rake. Results depend on your decisions." },
  paigow: { title: "Pai Gow in 10 seconds", steps: ["Pick a chip and tap Deal. You get seven cards.", "Tap House way to split them into a 5-card and a 2-card hand.", "Win both to win. Win one for a push. Wins pay less 5%."], odds: "The house banks, wins copied hands, and takes 5% commission on your wins. House edge about 2.9% with the house way." },
};

/** Anchor on /rules for a table's full rules and odds. */
export function rulesHref(game: string): string {
  return `/rules#${game}`;
}

/**
 * Slot cabinet glow tier from the real server-paid return and the coin-in.
 * 0: no glow (no pay, or paid back no more than the bet — never dressed up as a win)
 * 1: profit under 1x bet · 2: return at least 2x · 3: at least 6x · 4: at least 21x
 */
export function slotGlowTier(betCents: number | null | undefined, returnCents: number | null | undefined): 0 | 1 | 2 | 3 | 4 {
  const bet = Number(betCents) || 0, ret = Number(returnCents) || 0;
  if (bet <= 0 || ret <= bet) return 0;
  const m = ret / bet;
  return m >= 21 ? 4 : m >= 6 ? 3 : m >= 2 ? 2 : 1;
}
