/**
 * SS4: private "Your bests" per machine. Pure derivation from the player's own ledger rows
 * (bet / payout / refund) for one game. Nothing is stored, seeded or estimated: if the ledger
 * has no rows, every figure is empty. Never compared with other players, no streaks or goals.
 *
 * - Slots: a spin is one ref (the spin id). Biggest win = the most a single spin paid
 *   (cash + bonus payout rows for that ref, i.e. the WIN meter), shown with that spin's bet.
 * - Tables: a round is one ref (hand / spin id). Biggest win = the largest amount won beyond
 *   the stake in one round (payouts + refunds − bets for that ref). Craps pays on a per-roll ref,
 *   so it reads the wonCents the server wrote on each payout row.
 * - Bonuses: only machines with a bonus round count them, from what the server wrote on the
 *   spin's ledger rows (payout meta from the settled spin, plus a `features` tag on the bet row).
 *   Tournament play uses tourney chips outside the ledger, so it is not included.
 */

export type BestsKind = "slot" | "table";
export type BonusRule = "mine" | "clover" | "prairie" | "jackpot" | null;

export type BestsMachine = {
  /** Page id used on the client (/slot, /vault …). */
  id: string;
  /** The `game` column written on ledger rows. */
  ledgerGame: string;
  name: string;
  kind: BestsKind;
  bonus: BonusRule;
  /** Label for the count row. */
  countLabel: string;
};

export const BESTS_MACHINES: Record<string, BestsMachine> = {
  slot: { id: "slot", ledgerGame: "slot", name: "Sundown Trail", kind: "slot", bonus: null, countLabel: "Spins played" },
  vault: { id: "vault", ledgerGame: "vault-spire", name: "Antler Ridge", kind: "slot", bonus: "jackpot", countLabel: "Spins played" },
  buckshot: { id: "buckshot", ledgerGame: "buckshot", name: "Buckshot Bars", kind: "slot", bonus: null, countLabel: "Spins played" },
  bounty: { id: "bounty", ledgerGame: "bounty", name: "Bounty Bars", kind: "slot", bonus: null, countLabel: "Spins played" },
  mine: { id: "mine", ledgerGame: "mine", name: "Canary Creek Mine", kind: "slot", bonus: "mine", countLabel: "Spins played" },
  clover: { id: "clover", ledgerGame: "clover", name: "Kettle of Clover", kind: "slot", bonus: "clover", countLabel: "Spins played" },
  prairie: { id: "prairie", ledgerGame: "prairie", name: "Thunderhoof Prairie", kind: "slot", bonus: "prairie", countLabel: "Spins played" },
  blackjack: { id: "blackjack", ledgerGame: "blackjack", name: "Blackjack", kind: "table", bonus: null, countLabel: "Hands played" },
  holdem: { id: "holdem", ledgerGame: "holdem", name: "Texas Hold'em", kind: "table", bonus: null, countLabel: "Hands played" },
  paigow: { id: "paigow", ledgerGame: "paigow", name: "Pai Gow Poker", kind: "table", bonus: null, countLabel: "Hands played" },
  roulette: { id: "roulette", ledgerGame: "roulette", name: "Roulette", kind: "table", bonus: null, countLabel: "Spins played" },
  craps: { id: "craps", ledgerGame: "craps", name: "Craps", kind: "table", bonus: null, countLabel: "Bets placed" },
};

export function bestsMachine(id: string): BestsMachine | null {
  return Object.prototype.hasOwnProperty.call(BESTS_MACHINES, id) ? BESTS_MACHINES[id]! : null;
}

export type BestsRow = { type: string; amount_cents: number; ref: string | null; meta: string | null; created_at: string };

export type BonusName = "Free spins" | "Pick bonus" | "Wheel bonus" | "Hold & spin" | "Jackpot";

export type PersonalBests = {
  machine: string;
  name: string;
  kind: BestsKind;
  countLabel: string;
  /** Spins / hands / bets from the ledger. */
  count: number;
  /** null until something won. */
  biggestWin: { cents: number; betCents: number | null; at: string } | null;
  /** null = this machine has no bonus round. */
  bonuses: { total: number; byKind: { name: BonusName; count: number }[] } | null;
  firstAt: string | null;
};

function parseMeta(m: string | null): Record<string, unknown> {
  if (!m) return {};
  try { const v = JSON.parse(m); return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}; } catch { return {}; }
}
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Which bonus kinds one settled spin had, from its ledger meta (payout meta and/or bet `features`). */
export function bonusKindsFor(rule: BonusRule, metas: Record<string, unknown>[]): BonusName[] {
  if (!rule) return [];
  const out = new Set<BonusName>();
  for (const m of metas) {
    const tags = Array.isArray(m.features) ? (m.features as unknown[]).filter((x): x is string => typeof x === "string") : [];
    if (rule === "jackpot") {
      const hits = Array.isArray(m.progressiveHits) ? m.progressiveHits.length : 0;
      if (hits > 0 || num(m.progressiveAwardCents) > 0) out.add("Jackpot");
      continue;
    }
    if (num(m.freeSpins) > 0 || tags.includes("freeSpins")) out.add("Free spins");
    if (rule === "mine" && (num(m.picks) > 0 || tags.includes("pick"))) out.add("Pick bonus");
    if (rule === "clover" && (m.wheelInner != null || num(m.wheelWinCents) > 0 || tags.includes("wheel"))) out.add("Wheel bonus");
    if (rule === "prairie" && (num(m.holdCoins) > 0 || tags.includes("hold"))) out.add("Hold & spin");
  }
  return [...out];
}

/** Pure: derive the panel from one player's ledger rows for one machine. */
export function derivePersonalBests(machine: BestsMachine, rows: BestsRow[]): PersonalBests {
  type Agg = { bet: number; pay: number; refund: number; metas: Record<string, unknown>[]; payAt: string | null; hasBet: boolean; first: string };
  const byRef = new Map<string, Agg>();
  let firstAt: string | null = null;
  let crapsBets = 0, crapsUndos = 0;
  let crapsBest: { cents: number; at: string } | null = null;
  for (const r of rows) {
    if (!Number.isInteger(r.amount_cents) || !r.ref) continue;
    if (r.type !== "bet" && r.type !== "payout" && r.type !== "refund") continue;
    if (!firstAt || r.created_at < firstAt) firstAt = r.created_at;
    const meta = parseMeta(r.meta);
    if (machine.ledgerGame === "craps") {
      if (r.type === "bet") crapsBets++;
      else if (r.type === "refund") crapsUndos++;
      else {
        const won = num(meta.wonCents);
        if (won > 0 && (!crapsBest || won > crapsBest.cents)) crapsBest = { cents: won, at: r.created_at };
      }
      continue;
    }
    let a = byRef.get(r.ref);
    if (!a) { a = { bet: 0, pay: 0, refund: 0, metas: [], payAt: null, hasBet: false, first: r.created_at }; byRef.set(r.ref, a); }
    a.metas.push(meta);
    if (r.type === "bet") { a.bet += -r.amount_cents; a.hasBet = true; }
    else if (r.type === "payout") { a.pay += r.amount_cents; if (!a.payAt || r.created_at > a.payAt) a.payAt = r.created_at; }
    else a.refund += r.amount_cents;
  }

  let count = 0;
  let biggestWin: PersonalBests["biggestWin"] = null;
  const kinds = new Map<BonusName, number>();
  let bonusTotal = 0;

  if (machine.ledgerGame === "craps") {
    count = Math.max(0, crapsBets - crapsUndos);
    biggestWin = crapsBest ? { cents: crapsBest.cents, betCents: null, at: crapsBest.at } : null;
  } else {
    for (const a of byRef.values()) {
      if (!a.hasBet) continue; // a payout with no bet in this game is not a round played here
      count++;
      const won = machine.kind === "slot" ? a.pay : a.pay + a.refund - a.bet;
      if (won > 0 && (!biggestWin || won > biggestWin.cents)) biggestWin = { cents: won, betCents: a.bet, at: a.payAt ?? a.first };
      const ks = bonusKindsFor(machine.bonus, a.metas);
      if (ks.length) {
        bonusTotal++;
        for (const k of ks) kinds.set(k, (kinds.get(k) ?? 0) + 1);
      }
    }
  }

  return {
    machine: machine.id,
    name: machine.name,
    kind: machine.kind,
    countLabel: machine.countLabel,
    count,
    biggestWin,
    bonuses: machine.bonus ? { total: bonusTotal, byKind: [...kinds].map(([name, c]) => ({ name, count: c })) } : null,
    firstAt,
  };
}

/** Server helper: read only this player's rows for this machine. */
export function personalBestsFor(db: { prepare(sql: string): { all(...a: unknown[]): unknown[] } }, userId: string, machine: BestsMachine): PersonalBests {
  const rows = db.prepare(
    `SELECT type, amount_cents, ref, meta, created_at FROM ledger
     WHERE user_id = ? AND game = ? AND type IN ('bet','payout','refund') ORDER BY created_at ASC`
  ).all(userId, machine.ledgerGame) as BestsRow[];
  return derivePersonalBests(machine, rows);
}

/** Chicago short date for "won on Nov 12". */
export function bestsDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" });
}

/** Every player-facing sentence in the panel, kept here so the wording sweep can check it. */
export const BESTS_COPY = {
  title: "Your bests",
  button: "Your bests",
  private: "Only you can see this. It comes from your own ledger on this machine and is never compared with anyone.",
  noPlay: "Nothing here yet. Figures appear once you have played this machine.",
  noWin: "No wins yet",
  noBonusRound: "This machine has no bonus round",
  slotWinNote: (bet: string, date: string) => `paid on a ${bet} bet${date ? ` · ${date}` : ""}`,
  tableWinNote: (bet: string | null, date: string) => `won beyond ${bet ? `a ${bet} stake` : "the stake"}${date ? ` · ${date}` : ""}`,
  tourney: "Tournament play uses tourney chips and is not included.",
  limits: "Limits & breaks",
  close: "Close",
} as const;

/** Bet-row meta tag naming the bonus rounds a settled spin had (empty object when none). */
export function featureTag(list: unknown[]): { features?: string[] } {
  const f = list.filter((x): x is string => typeof x === "string" && x.length > 0);
  return f.length ? { features: f } : {};
}
