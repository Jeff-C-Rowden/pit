import { describe, it, expect, beforeEach } from "vitest";
import { resetDbForTests, isDirty, clearDirty } from "../src/lib/db";
import { getBalance, getBonusBalance, applyLedger } from "../src/lib/ledger";
import { creditBonus } from "../src/lib/bonus";
import { BRACKETS, FEE_BPS, FREEROLL_DAILY_CAP_CENTS, bracketFor, feeSplit, ladder, prizePool } from "../src/lib/tournaments/payout";
import { compareEntries, rankBoard, roundPoints, POINTS_CAP_PER_ROUND, type Scored } from "../src/lib/tournaments/scoring";
import { chicagoAt, instancesBetween, instancesForDay } from "../src/lib/tournaments/schedule";
import { TEMPLATES, type Template } from "../src/lib/tournaments/templates";
import { ensureSchedule, finalizeTournament, rebuyEntry, registerEntry, tournamentDetail, withdrawEntry, maskName } from "../src/lib/tournaments/store";
import { playTournamentRound, tournamentHud } from "../src/lib/tournaments/play";
import { houseBookSummary, cronAuthorized } from "../src/lib/tournaments/cron";
import { spinBuckshot } from "../src/lib/games/buckshot";
import type { TournamentRow } from "../src/lib/tournaments/schema";

describe("fee and prize pool (flat 25%)", () => {
  it("pool = (entries + rebuys) × buy-in × 0.75; fee is the rest", () => {
    expect(FEE_BPS).toBe(2500);
    expect(prizePool(4, 0, 100)).toEqual({ grossCents: 400, feeCents: 100, seedCents: 0, poolCents: 300 });
    expect(prizePool(12, 3, 500)).toEqual({ grossCents: 7500, feeCents: 1875, seedCents: 0, poolCents: 5625 });
    expect(prizePool(80, 20, 1000)).toEqual({ grossCents: 100000, feeCents: 25000, seedCents: 0, poolCents: 75000 });
    expect(prizePool(1, 0, 100).poolCents).toBe(75);
    expect(prizePool(7, 0, 0, 2000, 0)).toEqual({ grossCents: 0, feeCents: 0, seedCents: 2000, poolCents: 2000 });
    for (const b of [100, 200, 500, 1000]) {
      for (let n = 0; n < 200; n += 7) for (let r = 0; r < 30; r += 4) {
        const p = prizePool(n, r, b);
        expect(p.feeCents + p.poolCents).toBe(p.grossCents);
        expect(p.feeCents).toBe((n + r) * b / 4);
      }
    }
    expect(feeSplit(500)).toEqual({ toPoolCents: 375, feeCents: 125 });
  });
});

describe("payout ladder (scales with the field, top 10 max)", () => {
  it("every bracket sums to 10,000 bps, non-increasing, ≤10 places, contiguous from Q=1", () => {
    expect(BRACKETS[0]![0]).toBe(1);
    for (const [, bps] of BRACKETS) {
      expect(bps.reduce((a, b) => a + b, 0)).toBe(10000);
      expect(bps.length).toBeLessThanOrEqual(10);
      for (let i = 1; i < bps.length; i++) expect(bps[i]!).toBeLessThanOrEqual(bps[i - 1]!);
    }
    expect(bracketFor(0)).toEqual([]);
    expect(bracketFor(5)).toHaveLength(1);
    expect(bracketFor(6)).toHaveLength(2);
    expect(bracketFor(10)).toHaveLength(3);
    expect(bracketFor(15)).toHaveLength(4);
    expect(bracketFor(20)).toHaveLength(5);
    expect(bracketFor(35)).toHaveLength(6);
    expect(bracketFor(50)).toHaveLength(8);
    expect(bracketFor(51)).toHaveLength(10);
    expect(bracketFor(10_000)).toHaveLength(10);
  });
  it("Σ prizes = pool exactly, remainder to 1st, never more places than qualifiers", () => {
    for (let k = 0; k < 3000; k++) {
      const pool = Math.floor(Math.random() * 10_000_000);
      const q = 1 + Math.floor(Math.random() * 120);
      const l = ladder(pool, q);
      expect(l.reduce((a, b) => a + b, 0)).toBe(pool);
      expect(l.length).toBeLessThanOrEqual(Math.min(10, q));
      for (let i = 1; i < l.length; i++) expect(l[i]!).toBeLessThanOrEqual(l[i - 1]!);
    }
    expect(ladder(1001, 8)).toEqual([501, 300, 200]);
    expect(ladder(300, 1)).toEqual([300]);
    expect(ladder(999, 0)).toEqual([]);
  });
  it("min-cash: the last paid place gets at least the buy-in back at every tier and field size", () => {
    for (const b of [100, 200, 500, 1000]) for (const q of [2, 6, 7, 8, 11, 12, 16, 20, 21, 30, 36, 51, 80]) {
      const l = ladder(prizePool(q, 0, b).poolCents, q);
      expect(l[l.length - 1]!, `$${b / 100} Q=${q}`).toBeGreaterThanOrEqual(b);
    }
  });
});

describe("ranking modes", () => {
  it("accumulated points are the net win as a multiple of the stake (wins add, losses don't subtract)", () => {
    expect(roundPoints(10, 0)).toBe(0); // loss
    expect(roundPoints(10, 10)).toBe(0); // push
    expect(roundPoints(10, 25)).toBe(150); // blackjack 3:2 on 10
    expect(roundPoints(20, 20)).toBe(0); // red wins 10, 17 loses 10
    expect(roundPoints(10, 180)).toBe(1700); // straight-up on 5 + 5 elsewhere
    expect(roundPoints(25, 100000)).toBe(POINTS_CAP_PER_ROUND);
    expect(roundPoints(0, 50)).toBe(0);
  });
  it("whale invariance: the same outcomes at stake 5 and 50 score the same", () => {
    const mults = [0, 0, 2, 0, 1, 5, 0, 0.5, 10, 0, 40];
    const at = (s: number) => mults.reduce((a, m) => a + roundPoints(s, Math.round(s * m)), 0);
    expect(at(5)).toBe(at(50));
    expect(at(50)).toBe(at(500));
  });
  it("accumulated score never decreases over random rounds", () => {
    let score = 0;
    for (let i = 0; i < 2000; i++) {
      const s = 25 + Math.floor(Math.random() * 475), r = Math.random() < 0.6 ? 0 : Math.floor(Math.random() * s * 5);
      const next = score + roundPoints(s, r);
      expect(next).toBeGreaterThanOrEqual(score);
      score = next;
    }
  });
  const e = (id: string, o: Partial<Scored>): Scored => ({ id, score: 100, score_reached_at: "2026-11-11T10:00:00Z", bets_made: 20, best_round_points: 0, wagered_cents: 1000, created_at: "2026-11-11T09:00:00Z", ...o });
  it("tie-breaks form a total order: score, first to reach it, fewer bets, then mode rule, entry time, id", () => {
    const bal = compareEntries("balance"), acc = compareEntries("accumulated");
    expect([e("b", { score: 90 }), e("a", { score: 100 })].sort(bal).map((x) => x.id)).toEqual(["a", "b"]);
    expect([e("b", { score_reached_at: "2026-11-11T10:05:00Z" }), e("a", {})].sort(bal).map((x) => x.id)).toEqual(["a", "b"]);
    expect([e("b", { bets_made: 30 }), e("a", { bets_made: 25 })].sort(bal).map((x) => x.id)).toEqual(["a", "b"]);
    expect([e("b", { wagered_cents: 2000 }), e("a", {})].sort(bal).map((x) => x.id)).toEqual(["a", "b"]);
    expect([e("b", { best_round_points: 10 }), e("a", { best_round_points: 500 })].sort(acc).map((x) => x.id)).toEqual(["a", "b"]);
    expect([e("b", { created_at: "2026-11-11T09:30:00Z" }), e("a", {})].sort(bal).map((x) => x.id)).toEqual(["a", "b"]);
    expect([e("b", {}), e("a", {})].sort(bal).map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("only qualified entries place; the next qualified entry takes the prize; Q picks the bracket", () => {
    const rows = [e("hi", { score: 900, bets_made: 5 }), e("q1", { score: 500 }), e("q2", { score: 300 }), ...Array.from({ length: 5 }, (_, i) => e(`f${i}`, { score: 100 - i }))];
    const b = rankBoard(rows, "balance", 20, (q) => ladder(1000, q));
    expect(b.qualifiedCount).toBe(7);
    expect(b.ladder).toEqual([650, 350]);
    expect(b.rows.map((r) => [r.id, r.prizeCents])).toEqual([["q1", 650], ["q2", 350], ["f0", 0], ["f1", 0], ["f2", 0], ["f3", 0], ["f4", 0], ["hi", 0]]);
    expect(b.rows.at(-1)!.qualified).toBe(false);
  });
  it("a solo qualifier takes the whole pool; if nobody qualifies the top-ranked entrant does", () => {
    const solo = rankBoard([e("a", {}), e("b", { bets_made: 3, score: 999 })], "balance", 20, (q) => ladder(750, q));
    expect(solo.rows.map((r) => [r.id, r.prizeCents])).toEqual([["a", 750], ["b", 0]]);
    const none = rankBoard([e("a", { bets_made: 2, score: 50 }), e("b", { bets_made: 3, score: 999 })], "balance", 20, (q) => ladder(750, q));
    expect(none.fallback).toBe(true);
    expect(none.rows.map((r) => [r.id, r.prizeCents])).toEqual([["b", 750], ["a", 0]]);
    expect(rankBoard([], "balance", 20, (q) => ladder(750, q)).rows).toEqual([]);
  });
});

describe("schedule", () => {
  it("is deterministic and DST-correct (Mar 8 and Nov 1, 2026)", () => {
    const a = instancesBetween(new Date("2026-11-11T00:00:00Z"), new Date("2026-11-12T00:00:00Z"));
    const b = instancesBetween(new Date("2026-11-11T00:00:00Z"), new Date("2026-11-12T00:00:00Z"));
    expect(a).toEqual(b);
    expect(chicagoAt("2026-03-07", 23).toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(chicagoAt("2026-03-08", 23).toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(chicagoAt("2026-11-01", 8).toISOString()).toBe("2026-11-01T14:00:00.000Z");
    expect(chicagoAt("2026-10-31", 8).toISOString()).toBe("2026-10-31T13:00:00.000Z");
  });
  it("offers Free, $1, $2, $5 and $10 buy-ins, 15 min to 24 h, both modes, both prize types", () => {
    const week = Array.from({ length: 7 }, (_, i) => instancesForDay(`2026-11-1${i}`)).flat();
    expect(new Set(week.map((d) => d.buyin_cents))).toEqual(new Set([0, 100, 200, 500, 1000]));
    expect(new Set(week.map((d) => d.duration_min))).toEqual(new Set([15, 60, 360, 1440]));
    expect(new Set(week.map((d) => d.rank_mode))).toEqual(new Set(["balance", "accumulated"]));
    expect(week.filter((d) => d.buyin_cents > 0).every((d) => d.prize_type === "cash" && d.fee_bps === 2500)).toBe(true);
    const free = week.filter((d) => d.buyin_cents === 0);
    expect(free.filter((d) => d.prize_type === "bonus").length).toBeGreaterThan(free.length / 2);
    expect(free.every((d) => d.fee_bps === 0 && d.rebuy_fee_cents === null)).toBe(true);
  });
  it("never schedules more than $50 of house-funded freeroll pools in a Chicago day, even with a greedy template", () => {
    const greedy: Template = { ...TEMPLATES[0]!, id: "greedy", hours: [1, 2, 3, 4, 5, 6, 7], buyins: [0], seedCents: 1500 };
    for (let d = 1; d <= 28; d++) {
      const day = `2026-11-${String(d).padStart(2, "0")}`;
      for (const list of [instancesForDay(day), instancesForDay(day, [...TEMPLATES, greedy])]) {
        expect(list.reduce((a, x) => a + x.house_seed_cents, 0)).toBeLessThanOrEqual(FREEROLL_DAILY_CAP_CENTS);
      }
    }
  });
});

function seedDb() {
  const db = resetDbForTests();
  const ins = db.prepare(`INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, created_at) VALUES (?, ?, 'h', ?, 1, 0, ?, datetime('now'))`);
  for (let i = 1; i <= 12; i++) ins.run(`u${i}`, `u${i}@pit.test`, i === 1 ? "Jeff Rowden" : `Player ${i}`, 100_000);
  return db;
}
const live = (db: ReturnType<typeof seedDb>, tpl: string) => db.prepare("SELECT * FROM tournaments WHERE template_id = ? AND status = 'live' ORDER BY starts_at DESC LIMIT 1").get(tpl) as TournamentRow;
const user = (i: number) => ({ id: `u${i}`, display_name: i === 1 ? "Jeff Rowden" : `Player ${i}` });

function play(db: ReturnType<typeof seedDb>, uid: string, tid: string, stake: number, ret: number, key: string) {
  db.prepare("UPDATE tournament_entries SET last_round_at = NULL WHERE user_id = ? AND tournament_id = ?").run(uid, tid);
  const game = (db.prepare("SELECT game FROM tournaments WHERE id = ?").get(tid) as { game: string }).game;
  return playTournamentRound(db, uid, tid, game, key, (check) => { check(stake); return { stake, ret, result: null }; });
}

describe("tournament lifecycle on the ledger", () => {
  let db: ReturnType<typeof seedDb>;
  const now = () => new Date();
  beforeEach(() => { db = seedDb(); ensureSchedule(db, now(), 500); });

  it("ensureSchedule is idempotent and an idle poll writes nothing", () => {
    const n = (db.prepare("SELECT COUNT(*) c FROM tournaments").get() as { c: number }).c;
    expect(n).toBeGreaterThan(10);
    clearDirty();
    for (let i = 0; i < 5; i++) ensureSchedule(db, now());
    expect((db.prepare("SELECT COUNT(*) c FROM tournaments").get() as { c: number }).c).toBe(n);
    expect(isDirty()).toBe(false);
  });

  it("paid register: one cash buy-in, 25% fee booked, double tap = same entry; bonus can't buy in", () => {
    const t = live(db, "d10");
    const a = registerEntry(db, user(1), t.id, now());
    const b = registerEntry(db, user(1), t.id, now());
    expect(b.id).toBe(a.id);
    expect(a.display_name).toBe("Jeff R.");
    expect(getBalance("u1")).toBe(100_000 - 1000);
    expect(db.prepare("SELECT COUNT(*) c FROM ledger WHERE user_id='u1' AND game='tournament'").get()).toEqual({ c: 1 });
    expect(houseBookSummary(db, now()).feesCents).toBe(250);
    db.prepare("UPDATE users SET balance_cents = 0 WHERE id = 'u2'").run();
    creditBonus("u2", 50_000, null, null, "gift", null, "promo", db);
    expect(() => registerEntry(db, user(2), t.id, now())).toThrow(/insufficient/);
    expect(getBonusBalance("u2")).toBe(50_000);
  });

  it("rounds move only the tournament stack; balance score tracks the stack; pacing and bet limits hold", () => {
    const t = live(db, "fotd");
    registerEntry(db, user(1), t.id, now());
    const before = getBalance("u1");
    play(db, "u1", t.id, 100, 0, "r1");
    play(db, "u1", t.id, 100, 300, "r2");
    play(db, "u1", t.id, 100, 100, "r3");
    const hud = tournamentHud(db, "u1", t.id);
    expect(hud.stackCents).toBe(10_000 - 100 + 200 + 0);
    expect(hud.score).toBe(hud.stackCents);
    expect(hud.betsMade).toBe(3);
    expect(hud.toQualify).toBe(t.min_qualifying_bets - 3);
    expect(getBalance("u1")).toBe(before);
    expect(() => playTournamentRound(db, "u1", t.id, "buckshot", "fast", (c) => { c(100); return { stake: 100, ret: 0, result: null }; })).toThrow(/One round at a time/);
    expect(() => play(db, "u1", t.id, 5000, 0, "big")).toThrow(/Tournament bets are/);
    expect(() => play(db, "u1", t.id, 10, 0, "small")).toThrow(/Tournament bets are/);
    expect(() => playTournamentRound(db, "u1", t.id, "roulette", "wrong", (c) => { c(100); return { stake: 100, ret: 0, result: null }; })).toThrow(/played on/);
    expect(() => play(db, "u2", t.id, 100, 0, "x")).toThrow(/Register/);
    // a real engine spin: 200 rounds, wallet never moves
    for (let i = 0; i < 200; i++) {
      db.prepare("UPDATE tournament_entries SET last_round_at = NULL, stack_cents = 10000 WHERE user_id = 'u1'").run();
      playTournamentRound(db, "u1", t.id, "buckshot", `real${i}`, (check) => { const s = spinBuckshot(1, 25); check(s.betCents); return { stake: s.betCents, ret: s.winCents, result: s }; });
    }
    expect(getBalance("u1")).toBe(before);
    expect((db.prepare("SELECT COUNT(*) c FROM tournament_rounds").get() as { c: number }).c).toBe(203);
  });

  it("accumulated mode adds net-win multiples only", () => {
    const t = db.prepare("SELECT * FROM tournaments WHERE rank_mode = 'accumulated' AND status = 'live' AND game = 'roulette'").get() as TournamentRow | undefined;
    const tt = t ?? (db.prepare("UPDATE tournaments SET rank_mode = 'accumulated' WHERE id = ?").run(live(db, "fotd").id), live(db, "fotd"));
    registerEntry(db, user(3), tt.id, now());
    const g = tt.game;
    const p = (stake: number, ret: number, k: string) => { db.prepare("UPDATE tournament_entries SET last_round_at = NULL WHERE user_id = 'u3'").run(); playTournamentRound(db, "u3", tt.id, g, k, (c) => { c(stake); return { stake, ret, result: null }; }); };
    p(100, 0, "a"); p(100, 350, "b"); p(200, 200, "c"); p(50, 0, "d");
    const hud = tournamentHud(db, "u3", tt.id);
    expect(hud.score).toBe(250);
    expect(hud.stackCents).toBe(10_000 - 100 + 250 + 0 - 50);
  });

  it("finalize: Σ prizes = pool, fee + pool = gross, cash prizes to Cash, paid once; never cancelled", () => {
    const t = live(db, "d10");
    for (let i = 1; i <= 8; i++) registerEntry(db, user(i), t.id, now());
    // 7 qualify, u8 doesn't
    for (let i = 1; i <= 7; i++) for (let k = 0; k < t.min_qualifying_bets; k++) play(db, `u${i}`, t.id, 225, k === 0 ? 225 * i : 225, `q${i}-${k}`);
    play(db, "u8", t.id, 225, 9000, "lucky");
    const det = tournamentDetail(db, t.id, now(), "u1");
    expect(det.pool.poolCents).toBe(6000);
    expect(det.qualifiedCount).toBe(7);
    expect(det.ladder).toEqual([3900, 2100]);
    const bal = Array.from({ length: 8 }, (_, i) => getBalance(`u${i + 1}`));
    finalizeTournament(db, t.id, now());
    finalizeTournament(db, t.id, now());
    const paid = Array.from({ length: 8 }, (_, i) => getBalance(`u${i + 1}`) - bal[i]!);
    expect(paid).toEqual([0, 0, 0, 0, 0, 2100, 3900, 0]);
    expect(paid.reduce((a, b) => a + b, 0)).toBe(6000);
    expect(houseBookSummary(db, now()).feesCents).toBe(2000);
    expect(db.prepare("SELECT COUNT(*) c FROM ledger WHERE type = 'payout' AND game = 'tournament'").get()).toEqual({ c: 2 });
    expect((db.prepare("SELECT status FROM tournaments WHERE id = ?").get(t.id) as { status: string }).status).toBe("finished");
  });

  it("freeroll: a solo entrant who qualifies takes the house-seeded pool as BONUS; nobody qualifying still pays the top entrant", () => {
    const t = live(db, "fotd");
    registerEntry(db, user(1), t.id, now());
    for (let k = 0; k < t.min_qualifying_bets; k++) play(db, "u1", t.id, 25, 0, `s${k}`);
    const cash = getBalance("u1");
    finalizeTournament(db, t.id, now());
    expect(getBalance("u1")).toBe(cash);
    expect(getBonusBalance("u1")).toBe(2000);
    expect(houseBookSummary(db, now()).freerollSeedCents).toBe(2000);
    const r = live(db, "rd");
    registerEntry(db, user(2), r.id, now());
    registerEntry(db, user(3), r.id, now());
    const p = (u: string, ret: number, k: string) => { db.prepare("UPDATE tournament_entries SET last_round_at = NULL").run(); playTournamentRound(db, u, r.id, "roulette", k, (c) => { c(100); return { stake: 100, ret, result: null }; }); };
    p("u2", 200, "a"); p("u3", 3600, "b");
    const c3 = getBalance("u3");
    finalizeTournament(db, r.id, now());
    expect(getBalance("u3") - c3).toBe(r.house_seed_cents); // Roulette Daily pays cash
  });

  it("withdraw refunds in full before the first bet; rebuy only at or below the threshold and under the limit", () => {
    const qd = db.prepare("SELECT * FROM tournaments WHERE buyin_cents > 0 AND rebuy_fee_cents IS NOT NULL AND status IN ('scheduled','live') AND reg_closes_at > ? ORDER BY starts_at LIMIT 1").get(now().toISOString()) as TournamentRow;
    const b0 = getBalance("u4");
    registerEntry(db, user(4), qd.id, now());
    withdrawEntry(db, "u4", qd.id, now());
    expect(getBalance("u4")).toBe(b0);
    const t = db.prepare("SELECT * FROM tournaments WHERE buyin_cents > 0 AND rebuy_fee_cents IS NOT NULL AND status = 'live' AND reg_closes_at > ? LIMIT 1").get(now().toISOString()) as TournamentRow | undefined;
    if (!t) return; // no paid rebuy event live at this exact minute
    registerEntry(db, user(5), t.id, now());
    db.prepare("UPDATE tournament_entries SET last_round_at = NULL WHERE user_id='u5'").run();
    playTournamentRound(db, "u5", t.id, t.game, "w1", (c) => { c(t.min_bet_cents); return { stake: t.min_bet_cents, ret: 0, result: null }; });
    expect(() => withdrawEntry(db, "u5", t.id, now())).toThrow(/already played/);
    expect(() => rebuyEntry(db, "u5", t.id, now())).toThrow(/at or below/);
    db.prepare("UPDATE tournament_entries SET stack_cents = 500 WHERE user_id='u5'").run();
    const b = getBalance("u5");
    rebuyEntry(db, "u5", t.id, now());
    expect(getBalance("u5")).toBe(b - t.buyin_cents);
    expect(tournamentDetail(db, t.id, now(), "u5").pool.poolCents).toBe(prizePool(1, 1, t.buyin_cents).poolCents);
  });

  it("three freerolls a day per account; breaks block registering", () => {
    const frees = db.prepare("SELECT * FROM tournaments WHERE buyin_cents = 0 AND reg_closes_at > ? ORDER BY starts_at").all(now().toISOString()) as TournamentRow[];
    expect(frees.length).toBeGreaterThanOrEqual(2);
    db.prepare("UPDATE users SET break_until = ? WHERE id = 'u6'").run(new Date(Date.now() + 3600_000).toISOString());
    expect(() => registerEntry(db, user(6), frees[0]!.id, now())).toThrow(/break/);
    // three entries today, the fourth is refused
    const extra = Array.from({ length: 4 }, (_, i) => `T-x-${i}`);
    for (const id of extra) db.prepare(`INSERT INTO tournaments SELECT ?, 'x' || ?, name, format, category, game, rank_mode, starts_at, ends_at, reg_closes_at, duration_min, buyin_cents, fee_bps, house_seed_cents, prize_type, start_stack_cents, min_bet_cents, max_bet_cents, min_qualifying_bets, rebuy_fee_cents, rebuy_stack_cents, rebuy_max_balance_cents, rebuy_limit, chicago_day, status, seed, created_at, finalized_at FROM tournaments WHERE id = ?`).run(id, id, frees[0]!.id);
    for (let i = 0; i < 3; i++) registerEntry(db, user(7), extra[i]!, now());
    expect(() => registerEntry(db, user(7), extra[3]!, now())).toThrow(/3 free tournaments today/);
  });

  it("names are masked; the cron route needs the secret", () => {
    expect(maskName("Jeff Rowden")).toBe("Jeff R.");
    expect(maskName("solo")).toBe("solo");
    expect(cronAuthorized(null, "s")).toBe(false);
    expect(cronAuthorized("Bearer x", "s")).toBe(false);
    expect(cronAuthorized("Bearer s", undefined)).toBe(false);
    expect(cronAuthorized("Bearer s", "s")).toBe(true);
    void applyLedger;
  });
});
