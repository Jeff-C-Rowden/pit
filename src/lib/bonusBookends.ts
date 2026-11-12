/**
 * Slot Scout S5 player-paced bonus bookends.
 *
 * When a feature triggers, an intro card says what was won and gives one plain
 * rule line with a Start button (no countdown, nothing starts on its own).
 * When the feature ends, a summary card lists what each part paid, how many
 * spins / respins / picks were played, and the total, before the win shows on
 * the Balance. Every amount here is read from the server's settled spin; the
 * intro never reveals what the feature will pay.
 */
import { formatCents } from "@/lib/money";
import { signedMoney } from "@/lib/spinRecap";

export type BookendGame = "mine" | "prairie" | "clover";

export type FeatureStart =
  | { kind: "fs"; spins: number; source?: "kettle" | "wheel" | "scatter"; scatters?: number }
  | { kind: "pick" }
  | { kind: "hold"; coins: number }
  | { kind: "wheel" };

export type BonusIntro = {
  kicker: string;
  title: string;
  /** What was won, in plain words. */
  won: string;
  /** One plain rule line. */
  rule: string;
  start: string;
};

export const INTRO_NOTE = "The server already drew this feature when it triggered; playing it out just shows the results. It doesn't change the odds of the next spin.";
export const SUMMARY_NOTE = "The server settled this win when the feature triggered. Collect shows it on your Balance.";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function bonusIntro(game: BookendGame, f: FeatureStart, betCents: number): BonusIntro {
  const bet = formatCents(Math.max(0, Math.round(betCents)));
  if (f.kind === "fs") {
    const spins = Math.max(0, Math.floor(f.spins));
    const won = `${plural(spins, "free spin")} at your ${bet} bet, at no cost`;
    if (game === "mine") {
      return { kicker: `Dynamite!${f.scatters ? ` ${f.scatters} scatters` : ""}`, title: `${plural(spins, "Free Spin")}`, won, rule: "Every free-spin win pays ×2, and 3+ dynamite add more spins.", start: "Start free spins" };
    }
    if (game === "prairie") {
      return { kicker: `The storm rolls in${f.scatters ? ` · ${f.scatters} storm clouds` : ""}`, title: `${plural(spins, "Free Spin")}`, won, rule: "Sunset wilds carry 2× or 3× and multiply each other on a win.", start: "Start free spins" };
    }
    return { kicker: f.source === "wheel" ? "From the Rainbow Wheel" : `Three kettles!${f.scatters && f.scatters > 3 ? ` (${f.scatters})` : ""}`, title: `${plural(spins, "Free Spin")}`, won, rule: "Every clover wild that lands spreads across its whole reel.", start: "Start free spins" };
  }
  if (f.kind === "pick") {
    return { kicker: "Carts rolling in", title: "Mine Cart Pick", won: `A pick bonus paid in multiples of your ${bet} bet`, rule: "Open carts; prizes add up until a lamp says COLLECT. No cart is better than another.", start: "Start picking" };
  }
  if (f.kind === "hold") {
    return { kicker: `${plural(Math.max(0, f.coins), "herd coin")}`, title: "Hold & Spin", won: `A respin round on your ${bet} bet, at no cost`, rule: "Coins lock in place; 3 respins, and every new coin resets them to 3.", start: "Start Hold & Spin" };
  }
  return { kicker: "Rainbow bridges on reels 1, 3 & 5", title: "Rainbow Wheel", won: `One wheel spin on your ${bet} bet, at no cost`, rule: "One spin: a credit prize, free spins, or an upgrade to the Pot-of-Gold wheel.", start: "Spin the wheel" };
}

export type BookendRow = { label: string; cents: number };

export type BonusSummary = {
  totalCents: number;
  total: string;
  betCents: number;
  bet: string;
  rows: { label: string; amount: string }[];
  /** e.g. "12 free spins · 4 respins" or null when nothing was spun. */
  played: string | null;
  net: string;
  tone: "up" | "down" | "even";
  capped: string | null;
  /** True when the rows add up to the server total (they always should). */
  rowsAddUp: boolean;
  collect: string;
};

function c(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

export function buildSummary(rows: BookendRow[], totalCents: number, betCents: number, played: string[], capNote: string | null): BonusSummary {
  const total = c(totalCents);
  const bet = c(betCents);
  const net = total - bet;
  const clean = rows.map((r) => ({ label: r.label, cents: c(r.cents) }));
  return {
    totalCents: total,
    total: formatCents(total),
    betCents: bet,
    bet: formatCents(bet),
    rows: clean.map((r) => ({ label: r.label, amount: formatCents(r.cents) })),
    played: played.length ? played.join(" · ") : null,
    net: signedMoney(net),
    tone: net > 0 ? "up" : net < 0 ? "down" : "even",
    capped: capNote,
    rowsAddUp: clean.reduce((a, r) => a + r.cents, 0) === total,
    collect: `Collect ${formatCents(total)}`,
  };
}

type FsLike = { spins: unknown[]; totalWinCents: number; capped?: boolean; initial?: number };

export type MineLike = { betCents: number; baseWinCents: number; winCents: number; freeSpins: FsLike | null; pick: { reveals: unknown[]; totalX: number; totalWinCents: number } | null };
export type PrairieLike = { betCents: number; baseWinCents: number; winCents: number; freeSpins: FsLike | null; hold: { respins: unknown[]; board: (number | null)[]; totalX: number; totalWinCents: number; full?: boolean } | null };
export type WedgeLike = { kind: "credit"; x: number } | { kind: "fs"; spins: number } | { kind: "upgrade" };
export type CloverLike = { betCents: number; baseWinCents: number; winCents: number; freeSpins: FsLike | null; wheel: { outer: number | null; result: WedgeLike; creditWinCents: number; freeSpins: FsLike | null } | null };

const CAP = (cap: number) => `This feature reached the ${cap}-free-spin cap.`;

export function mineSummary(s: MineLike, cap = 100): BonusSummary {
  const rows: BookendRow[] = [{ label: "Base spin", cents: s.baseWinCents }];
  const played: string[] = [];
  if (s.freeSpins) { rows.push({ label: `Free spins (${s.freeSpins.spins.length} played, wins ×2)`, cents: s.freeSpins.totalWinCents }); played.push(plural(s.freeSpins.spins.length, "free spin")); }
  if (s.pick) { rows.push({ label: `Mine Cart (${s.pick.totalX}× bet)`, cents: s.pick.totalWinCents }); played.push(`${plural(s.pick.reveals.length, "cart")} opened`); }
  return buildSummary(rows, s.winCents, s.betCents, played, s.freeSpins?.capped ? CAP(cap) : null);
}

export function prairieSummary(s: PrairieLike, cap = 100): BonusSummary {
  const rows: BookendRow[] = [{ label: "Base spin", cents: s.baseWinCents }];
  const played: string[] = [];
  if (s.hold) {
    const coins = s.hold.board.filter((v) => v != null).length;
    rows.push({ label: `Hold & Spin (${coins} coins, ${s.hold.totalX}× bet)`, cents: s.hold.totalWinCents });
    played.push(plural(s.hold.respins.length, "respin"));
  }
  if (s.freeSpins) { rows.push({ label: `Free spins (${s.freeSpins.spins.length} played)`, cents: s.freeSpins.totalWinCents }); played.push(plural(s.freeSpins.spins.length, "free spin")); }
  return buildSummary(rows, s.winCents, s.betCents, played, s.freeSpins?.capped ? CAP(cap) : null);
}

export function wedgeText(w: WedgeLike): string {
  return w.kind === "credit" ? `${w.x}×` : w.kind === "fs" ? `${w.spins} free spins` : "Upgrade";
}

export function cloverSummary(s: CloverLike, cap = 100): BonusSummary {
  const rows: BookendRow[] = [{ label: "Base spin", cents: s.baseWinCents }];
  const played: string[] = [];
  let fsPlayed = 0;
  if (s.wheel) {
    rows.push({ label: `Rainbow Wheel (${s.wheel.outer !== null ? `upgrade → ${wedgeText(s.wheel.result)}` : wedgeText(s.wheel.result)})`, cents: s.wheel.creditWinCents });
    played.push(s.wheel.outer !== null ? "2 wheel spins" : "1 wheel spin");
    if (s.wheel.freeSpins) { rows.push({ label: `Wheel free spins (${s.wheel.freeSpins.spins.length} played)`, cents: s.wheel.freeSpins.totalWinCents }); fsPlayed += s.wheel.freeSpins.spins.length; }
  }
  if (s.freeSpins) { rows.push({ label: `Kettle free spins (${s.freeSpins.spins.length} played)`, cents: s.freeSpins.totalWinCents }); fsPlayed += s.freeSpins.spins.length; }
  if (fsPlayed) played.push(plural(fsPlayed, "free spin"));
  const capped = !!(s.freeSpins?.capped || s.wheel?.freeSpins?.capped);
  return buildSummary(rows, s.winCents, s.betCents, played, capped ? `A feature reached the ${cap}-free-spin cap.` : null);
}

/**
 * Balance to show while a feature plays: the server balance minus this spin's
 * win, i.e. the true balance right after the bet was taken. The full server
 * balance is shown again when the player collects on the summary card.
 */
export function balanceBeforeCollect(serverBalanceCents: number, winCents: number): number {
  const b = Number.isFinite(serverBalanceCents) ? Math.round(serverBalanceCents) : 0;
  return Math.max(0, b - c(winCents));
}

/** Does this settled spin include a bonus feature that gets bookends? */
export function spinHasFeature(s: { freeSpins?: unknown; pick?: unknown; hold?: unknown; wheel?: unknown } | null | undefined): boolean {
  return !!(s && (s.freeSpins || s.pick || s.hold || s.wheel));
}
