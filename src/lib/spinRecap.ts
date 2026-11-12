/**
 * Slot Scout S4 session recap: the last 10 settled spins on this machine
 * (bet / win / net) plus the visit's running totals. Plain numbers only:
 * every amount is the server's settled bet and win, recorded after the reels
 * (and any feature) finish, so the recap never reveals a result early.
 */
import { formatCents } from "@/lib/money";

export const RECAP_MAX = 10;

export type RecapSpin = {
  /** 1-based spin number this visit. */
  n: number;
  betCents: number;
  winCents: number;
  /** True when a bonus feature paid into this spin's win. */
  feature?: boolean;
};

export type RecapState = {
  /** Newest first, at most RECAP_MAX. */
  spins: RecapSpin[];
  count: number;
  betTotal: number;
  winTotal: number;
};

export const EMPTY_RECAP: RecapState = { spins: [], count: 0, betTotal: 0, winTotal: 0 };

function cents(v: number): number {
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

export function addRecapSpin(s: RecapState, spin: { betCents: number; winCents: number; feature?: boolean }): RecapState {
  const betCents = cents(spin.betCents);
  const winCents = cents(spin.winCents);
  const n = s.count + 1;
  const row: RecapSpin = { n, betCents, winCents, ...(spin.feature ? { feature: true } : {}) };
  return {
    spins: [row, ...s.spins].slice(0, RECAP_MAX),
    count: n,
    betTotal: s.betTotal + betCents,
    winTotal: s.winTotal + winCents,
  };
}

export function netCents(bet: number, win: number): number {
  return win - bet;
}

/** "+$4.50", "−$0.90", "$0.00" (true minus sign, never a fake plus on zero). */
export function signedMoney(c: number): string {
  if (c === 0) return formatCents(0);
  return `${c > 0 ? "+" : "−"}${formatCents(Math.abs(c))}`;
}

export type RecapRow = { n: number; bet: string; win: string; net: string; tone: "up" | "down" | "even"; feature: boolean };

export function recapRows(s: RecapState): RecapRow[] {
  return s.spins.map((r) => {
    const net = netCents(r.betCents, r.winCents);
    return {
      n: r.n,
      bet: formatCents(r.betCents),
      win: formatCents(r.winCents),
      net: signedMoney(net),
      tone: net > 0 ? "up" : net < 0 ? "down" : "even",
      feature: !!r.feature,
    };
  });
}

export function recapSummary(s: RecapState): { spins: string; bet: string; won: string; net: string; tone: "up" | "down" | "even" } {
  const net = netCents(s.betTotal, s.winTotal);
  return {
    spins: `${s.count} spin${s.count === 1 ? "" : "s"}`,
    bet: formatCents(s.betTotal),
    won: formatCents(s.winTotal),
    net: signedMoney(net),
    tone: net > 0 ? "up" : net < 0 ? "down" : "even",
  };
}

export const RECAP_NOTE = "This visit only, on this machine. Every spin is independent; past spins don't change the next one.";
export const RECAP_EMPTY = "No spins yet this visit.";
