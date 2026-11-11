/** Deterministic tournament schedule from templates (pure). Chicago local times, stored as UTC. */
import { createHash } from "crypto";
import { FEE_BPS, FREEROLL_DAILY_CAP_CENTS } from "./payout";
import { GAME_INFO, TEMPLATES, minQualifying, rebuyLimit, type PrizeType, type Template, type TGame } from "./templates";
import type { RankMode } from "./scoring";

export const SCHEDULE_SALT = "pit-tournaments-v1";
const TZ = "America/Chicago";

export type TournamentDraft = {
  id: string;
  template_id: string;
  name: string;
  format: string;
  category: "slots" | "tables";
  game: TGame;
  rank_mode: RankMode;
  starts_at: string;
  ends_at: string;
  reg_closes_at: string;
  duration_min: number;
  buyin_cents: number;
  fee_bps: number;
  house_seed_cents: number;
  prize_type: PrizeType;
  start_stack_cents: number;
  min_bet_cents: number;
  max_bet_cents: number;
  min_qualifying_bets: number;
  rebuy_fee_cents: number | null;
  rebuy_stack_cents: number | null;
  rebuy_max_balance_cents: number | null;
  rebuy_limit: number;
  chicago_day: string;
  seed: string;
};

const YMD_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const HOUR_FMT = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" });
export function chicagoYmd(d: Date): string {
  return YMD_FMT.format(d);
}
function chicagoHour(d: Date): number {
  return Number(HOUR_FMT.format(d)) % 24;
}

/** UTC instant of `hour`:00 Chicago time on the Chicago date `ymd` (DST-safe). */
export function chicagoAt(ymd: string, hour: number): Date {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  // CST is UTC-6, CDT is UTC-5: try both and keep the one that reads back as the wanted local time.
  for (const off of [6, 5]) {
    const t = new Date(Date.UTC(y, m - 1, d, hour + off));
    if (chicagoYmd(t) === ymd && chicagoHour(t) === hour) return t;
  }
  return new Date(Date.UTC(y, m - 1, d, hour + 6));
}

const compact = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").slice(0, 14) + "Z";

function pick<T>(list: readonly T[], byte: number): T { return list[byte % list.length]!; }

export function draftFor(t: Template, ymd: string, hour: number): TournamentDraft {
  const start = chicagoAt(ymd, hour);
  const startIso = start.toISOString();
  const seed = createHash("sha256").update(`${t.id}|${startIso}|${SCHEDULE_SALT}`).digest();
  const game = pick(t.games, seed[0]!);
  const mode = pick(t.modes, seed[1]!);
  const buyin = pick(t.buyins, seed[2]!);
  const info = GAME_INFO[game];
  const end = new Date(start.getTime() + t.durationMin * 60_000);
  // Registration closes 15 min before the end (5 min before for 15-minute events).
  const regClose = new Date(end.getTime() - (t.durationMin <= 15 ? 5 : 15) * 60_000);
  const free = buyin === 0;
  const rebuys = t.rebuys && !free;
  return {
    id: `T-${t.id}-${compact(startIso).slice(0, 13)}Z`,
    template_id: t.id,
    name: t.name,
    format: t.format,
    category: info.category,
    game,
    rank_mode: mode,
    starts_at: startIso,
    ends_at: end.toISOString(),
    reg_closes_at: regClose.toISOString(),
    duration_min: t.durationMin,
    buyin_cents: buyin,
    fee_bps: free ? 0 : FEE_BPS,
    house_seed_cents: free ? t.seedCents : 0,
    prize_type: free ? t.freePrize : t.paidPrize,
    start_stack_cents: t.startStackCents,
    min_bet_cents: info.minBet,
    max_bet_cents: info.maxBet,
    min_qualifying_bets: minQualifying(t.durationMin, info.category),
    rebuy_fee_cents: rebuys ? buyin : null,
    rebuy_stack_cents: rebuys ? t.startStackCents : null,
    rebuy_max_balance_cents: rebuys ? Math.floor(t.startStackCents / 10) : null,
    rebuy_limit: rebuys ? rebuyLimit(t.durationMin) : 0,
    chicago_day: ymd,
    seed: seed.toString("hex").slice(0, 16),
  };
}

/** Every instance starting on Chicago day `ymd`, with the freeroll daily cap applied in start order. */
const dayCache = new Map<string, TournamentDraft[]>();
export function instancesForDay(ymd: string, templates: Template[] = TEMPLATES, capCents = FREEROLL_DAILY_CAP_CENTS): TournamentDraft[] {
  const cacheable = templates === TEMPLATES && capCents === FREEROLL_DAILY_CAP_CENTS;
  if (cacheable && dayCache.has(ymd)) return dayCache.get(ymd)!;
  const out = buildDay(ymd, templates, capCents);
  if (cacheable) { if (dayCache.size > 64) dayCache.clear(); dayCache.set(ymd, out); }
  return out;
}

function buildDay(ymd: string, templates: Template[], capCents: number): TournamentDraft[] {
  const all = templates.flatMap((t) => t.hours.map((h) => draftFor(t, ymd, h)))
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : a.id < b.id ? -1 : 1));
  let seeded = 0;
  return all.filter((d) => {
    if (d.house_seed_cents <= 0) return true;
    if (seeded + d.house_seed_cents > capCents) return false; // would break the $50/day house budget
    seeded += d.house_seed_cents;
    return true;
  });
}

function addDays(ymd: string, n: number): string {
  const t = new Date(Date.parse(ymd + "T12:00:00Z") + n * 86_400_000);
  return t.toISOString().slice(0, 10);
}

/** Instances that overlap [from, to] (they end after `from` and start before or at `to`). */
export function instancesBetween(from: Date, to: Date, templates: Template[] = TEMPLATES, capCents = FREEROLL_DAILY_CAP_CENTS): TournamentDraft[] {
  const out: TournamentDraft[] = [];
  for (let day = addDays(chicagoYmd(from), -2); day <= addDays(chicagoYmd(to), 1); day = addDays(day, 1)) {
    for (const d of instancesForDay(day, templates, capCents)) {
      if (Date.parse(d.ends_at) > from.getTime() && Date.parse(d.starts_at) <= to.getTime()) out.push(d);
    }
  }
  return out;
}
