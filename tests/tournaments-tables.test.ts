import { describe, it, expect, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { resetDbForTests, isTestEmail } from "../src/lib/db";
import { getBalance, getBonusBalance } from "../src/lib/ledger";
import { createUser } from "../src/lib/auth";
import { currentSession, sessionActivity } from "../src/lib/session";
import { applyPrizeCap, FREEROLL_DAILY_CAP_CENTS } from "../src/lib/tournaments/payout";
import { instancesForDay } from "../src/lib/tournaments/schedule";
import { GAME_INFO, TABLE_FORMATS } from "../src/lib/tournaments/templates";
import { ensureSchedule, finalizeTournament, registerEntry, tournamentDetail, listTournaments, FREEROLL_PLAYER_DAY_CAP_CENTS } from "../src/lib/tournaments/store";
import { playTournamentRound, tournamentHud } from "../src/lib/tournaments/play";
import { blackjackTournament, crapsTournament, tnyGameKey } from "../src/lib/tournaments/tables";
import { getHitHistoryByTier, getRecentProgressiveHits } from "../src/lib/progressive";
import type { TournamentRow, EntryRow } from "../src/lib/tournaments/schema";

function seedDb() {
  const db = resetDbForTests();
  const ins = db.prepare(`INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, is_test, balance_cents, created_at) VALUES (?, ?, 'h', ?, 1, 0, ?, 100000, datetime('now'))`);
  for (let i = 1; i <= 8; i++) ins.run(`u${i}`, `u${i}@pit.example`, `Player ${i}`, 0);
  ins.run("t1", "bot1@pit.test", "E2E Tester", 1);
  return db;
}
type DB = ReturnType<typeof seedDb>;
const now = () => new Date();
const live = (db: DB, tpl: string) => db.prepare("SELECT * FROM tournaments WHERE template_id = ? AND status = 'live' ORDER BY starts_at DESC LIMIT 1").get(tpl) as TournamentRow;
const user = (id: string) => ({ id, display_name: id === "t1" ? "E2E Tester" : `Player ${id.slice(1)}` });
const entry = (db: DB, tid: string, uid: string) => db.prepare("SELECT * FROM tournament_entries WHERE tournament_id = ? AND user_id = ?").get(tid, uid) as EntryRow;
const unpace = (db: DB) => db.prepare("UPDATE tournament_entries SET last_round_at = NULL").run();
function slot(db: DB, uid: string, tid: string, stake: number, ret: number, key: string) {
  unpace(db);
  const game = (db.prepare("SELECT game FROM tournaments WHERE id = ?").get(tid) as { game: string }).game;
  return playTournamentRound(db, uid, tid, game, key, (c) => { c(stake); return { stake, ret, result: null }; });
}

describe("test accounts are invisible and can't win", () => {
  let db: DB;
  beforeEach(() => { db = seedDb(); ensureSchedule(db, now(), 500); });

  it("@pit.test signups are marked test; every e2e script signs up at @pit.test", () => {
    expect(isTestEmail("x123@pit.test")).toBe(true);
    expect(isTestEmail("jeff@gmail.com")).toBe(false);
    const u = createUser({ email: `e2e${Date.now()}@pit.test`, password: "password1", displayName: "E2E", ageConfirmed: true });
    expect((db.prepare("SELECT is_test FROM users WHERE id = ?").get(u.id) as { is_test: number }).is_test).toBe(1);
    const real = createUser({ email: `real${Date.now()}@example.com`, password: "password1", displayName: "Real", ageConfirmed: true });
    expect((db.prepare("SELECT is_test FROM users WHERE id = ?").get(real.id) as { is_test: number }).is_test).toBe(0);
    for (const f of readdirSync("tests/e2e").filter((n) => n.endsWith(".mjs"))) {
      const src = readFileSync(`tests/e2e/${f}`, "utf8");
      // Scripts that actually create an account: hit the signup API or fill the signup form.
      // (Visiting the /signup page, e.g. the signed-out demo spin check, is not a signup.)
      if (!/api\/auth\/signup|su-email|su-pass/.test(src)) continue;
      const emails = src.match(/`[a-z0-9]+\$\{Date\.now\(\)\}@[a-z.]+`/g) ?? [];
      expect(emails.length, f).toBeGreaterThan(0);
      for (const e of emails) expect(e.endsWith("@pit.test`"), `${f}: ${e}`).toBe(true);
    }
  });

  it("hidden from board, counts and pool; sees its own entry as an unranked test entry; never paid", () => {
    const t = live(db, "fotd");
    registerEntry(db, user("t1"), t.id, now());
    registerEntry(db, user("u1"), t.id, now());
    for (let k = 0; k < t.min_qualifying_bets; k++) slot(db, "t1", t.id, 25, k === 0 ? 5000 : 25, `t${k}`);
    slot(db, "u1", t.id, 25, 0, "u0");
    const d = tournamentDetail(db, t.id, now(), "u2");
    expect(d.pool.entrants).toBe(1);
    expect(d.top.map((r) => r.name)).toEqual(["Player 1."]);
    expect(listTournaments(db, now(), "live", null).find((x) => x.id === t.id)!.entrants).toBe(1);
    const mine = tournamentDetail(db, t.id, now(), "t1").me!;
    expect(mine.testAccount).toBe(true);
    expect(mine.rank).toBeNull();
    expect(mine.qualified).toBe(true);
    const hud = tournamentHud(db, "t1", t.id);
    expect(hud.entered && hud.testAccount && hud.rank === null && hud.entrants === 1).toBe(true);
    const b1 = getBonusBalance("u1"), bt = getBonusBalance("t1");
    finalizeTournament(db, t.id, now());
    expect(getBonusBalance("t1")).toBe(bt);
    expect(getBonusBalance("u1") - b1).toBe(t.house_seed_cents); // nobody (real) qualified → top real entrant
    expect(entry(db, t.id, "t1").status).toBe("unplaced");
  });

  it("progressive hit lists skip test accounts", () => {
    const ins = db.prepare("INSERT INTO progressive_hits (id, tier_id, tier_name, amount_cents, user_id, created_at) VALUES (?, 'vault-mini', 'Mini', ?, ?, ?)");
    ins.run("h1", 1000, "t1", new Date(Date.now() - 1000).toISOString());
    ins.run("h2", 1200, "u1", new Date(Date.now() - 2000).toISOString());
    expect(getRecentProgressiveHits(db).map((h) => h.amountCents)).toEqual([1200]);
    expect(getHitHistoryByTier(db).map((h) => h.amountCents)).toEqual([1200]);
  });
});

describe("freeroll prize cap: $25 a day per account, excess to the next place", () => {
  it("pure cap moves excess down, Σ conserved", () => {
    const rows = [{ key: "a", eligible: true, prizeCents: 2000 }, { key: "b", eligible: true, prizeCents: 0 }, { key: "c", eligible: false, prizeCents: 0 }];
    const r = applyPrizeCap(rows, (k) => (k === "a" ? 500 : 2500));
    expect(r.prizes).toEqual([500, 1500, 0]);
    expect(r.unpaidCents).toBe(0);
    const r2 = applyPrizeCap([{ key: "a", eligible: true, prizeCents: 2000 }], () => 300);
    expect(r2.prizes).toEqual([300]);
    expect(r2.unpaidCents).toBe(1700);
    for (let k = 0; k < 500; k++) {
      const rs = Array.from({ length: 1 + (k % 12) }, (_, i) => ({ key: `k${i % 5}`, eligible: Math.random() < 0.8, prizeCents: Math.floor(Math.random() * 3000) }));
      const out = applyPrizeCap(rs, () => Math.floor(Math.random() * 3000));
      expect(out.prizes.reduce((a, b) => a + b, 0) + out.unpaidCents).toBe(rs.reduce((a, b) => a + b.prizeCents, 0));
    }
  });

  it("a second freeroll win the same day is capped and the rest goes to the runner-up", () => {
    const db = seedDb(); ensureSchedule(db, now(), 500);
    expect(FREEROLL_PLAYER_DAY_CAP_CENTS).toBe(2500);
    const f = live(db, "fotd");            // $20 seed, bonus
    registerEntry(db, user("u1"), f.id, now());
    for (let k = 0; k < f.min_qualifying_bets; k++) slot(db, "u1", f.id, 25, 25, `f${k}`);
    finalizeTournament(db, f.id, now());
    expect(getBonusBalance("u1")).toBe(2000);
    const r = live(db, "rd");              // $10 seed, cash
    registerEntry(db, user("u1"), r.id, now());
    registerEntry(db, user("u2"), r.id, now());
    for (let k = 0; k < r.min_qualifying_bets; k++) { slot(db, "u1", r.id, 100, k === 0 ? 900 : 100, `a${k}`); slot(db, "u2", r.id, 100, 100, `b${k}`); }
    const det = tournamentDetail(db, r.id, now(), "u1");
    expect(det.top.map((x) => x.prizeCents)).toEqual([500, 500]);
    const c1 = getBalance("u1"), c2 = getBalance("u2");
    finalizeTournament(db, r.id, now());
    expect(getBalance("u1") - c1).toBe(500);
    expect(getBalance("u2") - c2).toBe(500);
  });
});

describe("session time counts tournament play", () => {
  it("tournament rounds start and extend the session; they add nothing to net", () => {
    const db = seedDb(); ensureSchedule(db, now(), 500);
    expect(currentSession(db, "u3").active).toBe(false);
    const t = live(db, "fotd");
    registerEntry(db, user("u3"), t.id, now());
    slot(db, "u3", t.id, 25, 0, "s1");
    const s = currentSession(db, "u3");
    expect(s.active).toBe(true);
    expect(s.netCents).toBe(0);
    db.prepare("UPDATE tournament_rounds SET created_at = ?").run(new Date(Date.now() - 50 * 60_000).toISOString());
    slot(db, "u3", t.id, 25, 0, "s2");
    db.prepare("UPDATE tournament_rounds SET created_at = ? WHERE idempotency_key LIKE '%s2'").run(new Date(Date.now() - 25 * 60_000).toISOString());
    expect(currentSession(db, "u3").minutes).toBeGreaterThanOrEqual(49);
    db.prepare("UPDATE users SET session_limit_min = 30 WHERE id = 'u3'").run();
    expect(() => slot(db, "u3", t.id, 25, 0, "s3")).toThrow(/session time limit/);
  });
});

describe("session bar bet count includes tournament bets", () => {
  it("counts tournament rounds in this session as bets, with no wallet rows", () => {
    const db = seedDb(); ensureSchedule(db, now(), 500);
    const t = live(db, "fotd");
    registerEntry(db, user("u3"), t.id, now());
    expect(sessionActivity(db, "u3").tournamentBets).toBe(0);
    slot(db, "u3", t.id, 25, 0, "b1"); slot(db, "u3", t.id, 25, 0, "b2");
    const a = sessionActivity(db, "u3");
    expect(a.rows).toEqual([]);
    expect(a.tournamentBets).toBe(2);
    // rounds from an earlier, ended session are not counted
    db.prepare("UPDATE tournament_rounds SET created_at = ?").run(new Date(Date.now() - 3 * 3600_000).toISOString());
    slot(db, "u3", t.id, 25, 0, "b3");
    expect(sessionActivity(db, "u3").tournamentBets).toBe(1);
  });
});

describe("schedule: Blackjack Chip Race and Craps Hot Roll", () => {
  it("Blackjack Daily and Craps Daily every day, Happy Hour rotates BJ/Roulette/Craps, budget holds", () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 60; d++) {
      const day = new Date(Date.UTC(2026, 10, d)).toISOString().slice(0, 10);
      const list = instancesForDay(day);
      expect(list.reduce((a, x) => a + x.house_seed_cents, 0)).toBeLessThanOrEqual(FREEROLL_DAILY_CAP_CENTS);
      for (const id of ["fotd", "rd", "bjd", "crd"]) expect(list.some((x) => x.template_id === id), `${day} ${id}`).toBe(true);
      for (const x of list) {
        const tf = TABLE_FORMATS[x.game];
        if (tf) {
          expect(x.format).toBe(tf.format);
          expect(x.rank_mode).toBe(tf.mode);
          expect(x.fixed_plays).toBe(tf.fixedPlays);
          expect(x.min_qualifying_bets).toBeLessThanOrEqual(tf.fixedPlays);
          expect(x.min_bet_cents).toBe(GAME_INFO[x.game].minBet);
        } else expect(x.fixed_plays).toBeNull();
        if (x.template_id === "hr") seen.add(x.game);
      }
    }
    expect(seen).toEqual(new Set(["blackjack", "roulette", "craps"]));
    expect(TABLE_FORMATS.blackjack).toMatchObject({ mode: "balance", fixedPlays: 30 });
    expect(TABLE_FORMATS.craps).toMatchObject({ mode: "accumulated", fixedPlays: 40 });
  });
});

describe("Blackjack Chip Race on the tournament stack", () => {
  let db: DB; let t: TournamentRow;
  beforeEach(() => { db = seedDb(); ensureSchedule(db, now(), 500); t = live(db, "bjd"); registerEntry(db, user("u1"), t.id, now()); });

  it("30 hands max; stack = start − Σ staked + Σ paid; score = stack; wallet untouched", () => {
    const wallet = getBalance("u1");
    expect(() => blackjackTournament(db, "u1", t.id, { action: "deal", betCents: 50 })).toThrow(/\$1\.00 to \$20\.00/);
    expect(() => blackjackTournament(db, "u1", t.id, { action: "deal", betCents: 2500 })).toThrow(/\$1\.00 to \$20\.00/);
    let expected = t.start_stack_cents;
    for (let h = 0; h < t.fixed_plays!; h++) {
      unpace(db);
      let g = blackjackTournament(db, "u1", t.id, { action: "deal", betCents: 200, idempotencyKey: `d${h}` }).game!;
      if (h === 0 && g.phase !== "settled") expect(() => { unpace(db); blackjackTournament(db, "u1", t.id, { action: "deal", betCents: 200 }); }).toThrow(/Finish the hand/);
      let guard = 0;
      while (g.phase !== "settled" && guard++ < 12) {
        const action = g.phase === "insurance" ? "insurance" : g.canDouble && h % 3 === 0 ? "double" : "stand";
        g = blackjackTournament(db, "u1", t.id, { action, take: h % 2 === 0 }).game!;
      }
      expect(g.phase).toBe("settled");
      const r = db.prepare("SELECT * FROM tournament_rounds ORDER BY rowid DESC LIMIT 1").get() as { stake_cents: number; return_cents: number };
      expect(r.stake_cents).toBe(g.playerHands.reduce((a: number, x: { betCents: number }) => a + x.betCents, 0) + g.insuranceCents);
      expect(r.return_cents).toBe(g.payoutCents);
      expected += r.return_cents - r.stake_cents;
      const e = entry(db, t.id, "u1");
      expect(e.stack_cents).toBe(expected);
      expect(e.score).toBe(expected);
      expect(e.plays_used).toBe(h + 1);
    }
    unpace(db);
    expect(() => blackjackTournament(db, "u1", t.id, { action: "deal", betCents: 200 })).toThrow(/all 30 hands/);
    expect(entry(db, t.id, "u1").bets_made).toBe(30);
    expect(tournamentHud(db, "u1", t.id)).toMatchObject({ qualified: true, playsLeft: 0, fixedPlays: 30 });
    expect(getBalance("u1")).toBe(wallet);
  });

  it("a hand left open at the end is played out (stand) at finalize and scored, not forfeited", () => {
    let g = blackjackTournament(db, "u1", t.id, { action: "deal", betCents: 500 }).game!;
    let tries = 0;
    while (g.phase === "settled" && tries++ < 40) { unpace(db); g = blackjackTournament(db, "u1", t.id, { action: "deal", betCents: 500, idempotencyKey: `x${tries}` }).game!; }
    expect(g.phase).not.toBe("settled");
    const before = entry(db, t.id, "u1");
    finalizeTournament(db, t.id, now());
    const after = entry(db, t.id, "u1");
    expect(after.plays_used).toBe(before.plays_used + 1);
    const st = db.prepare("SELECT status, state_json FROM game_states WHERE game = ? AND id = ?").get(tnyGameKey(t.id), g!.id) as { status: string; state_json: string };
    expect(st.status).toBe("settled");
    const bj = JSON.parse(st.state_json).bj;
    expect(bj.result).not.toBe("hand closed");
    expect(after.stack_cents).toBe(before.stack_cents + (bj.payoutCents ?? 0));
  });
});

describe("Craps Hot Roll on the tournament stack", () => {
  let db: DB; let t: TournamentRow;
  beforeEach(() => { db = seedDb(); ensureSchedule(db, now(), 500); t = live(db, "crd"); registerEntry(db, user("u2"), t.id, now()); });
  const layout = (tid: string) => {
    const s = db.prepare("SELECT state_json FROM game_states WHERE game = ? AND status = 'open'").get(tnyGameKey(tid)) as { state_json: string } | undefined;
    if (!s) return 0;
    const tb = JSON.parse(s.state_json).table;
    return tb.pass + tb.passOdds + tb.dontPass + tb.dontPassOdds + tb.field + tb.anySeven + tb.anyCraps + tb.yo
      + Object.values(tb.place as Record<string, number>).reduce((a, b) => a + b, 0) + Object.values(tb.hard as Record<string, number>).reduce((a, b) => a + b, 0)
      + tb.come.reduce((a: number, c: { amount: number; odds: number }) => a + c.amount + c.odds, 0) + tb.dontCome.reduce((a: number, c: { amount: number; odds: number }) => a + c.amount + c.odds, 0);
  };

  it("new action per roll capped at $10; need 50¢ down to roll; undo returns chips", () => {
    expect(() => { unpace(db); crapsTournament(db, "u2", t.id, { action: "roll" }); }).toThrow(/at least \$0\.50/);
    crapsTournament(db, "u2", t.id, { action: "bet", bet: { type: "field", amount: 600 } });
    expect(() => crapsTournament(db, "u2", t.id, { action: "bet", bet: { type: "pass", amount: 500 } })).toThrow(/\$10\.00 of new bets/);
    crapsTournament(db, "u2", t.id, { action: "bet", bet: { type: "pass", amount: 400 } });
    expect(entry(db, t.id, "u2").stack_cents).toBe(t.start_stack_cents - 1000);
    crapsTournament(db, "u2", t.id, { action: "undo" });
    expect(entry(db, t.id, "u2").stack_cents).toBe(t.start_stack_cents - 600);
    expect(() => crapsTournament(db, "u2", t.id, { action: "repeat" })).toThrow(/isn't available/);
  });

  it("40 rolls: stack + felt = start + Σ(R − S); points only for resolved, net-positive rolls; final roll returns the felt", () => {
    const wallet = getBalance("u2");
    let net = 0; let score = 0;
    for (let i = 0; i < t.fixed_plays!; i++) {
      unpace(db);
      if (layout(t.id) === 0 || i % 5 === 0) {
        const tb = crapsTournament(db, "u2", t.id, { action: "state" }).table as { point: number | null };
        if (tb.point == null && i % 2 === 0) crapsTournament(db, "u2", t.id, { action: "bet", bet: { type: "pass", amount: 100 } });
      }
      crapsTournament(db, "u2", t.id, { action: "bet", bet: { type: "field", amount: 100 } });
      const out = crapsTournament(db, "u2", t.id, { action: "roll", idempotencyKey: `r${i}` }) as unknown as { resolvedStakeCents: number; returnCents: number; points: number; lastRoll: boolean; returnedCents: number };
      expect(out.resolvedStakeCents).toBeGreaterThanOrEqual(100); // the field always resolves
      net += out.returnCents - out.resolvedStakeCents;
      const want = out.returnCents > out.resolvedStakeCents ? Math.floor(((out.returnCents - out.resolvedStakeCents) * 100) / out.resolvedStakeCents) : 0;
      expect(out.points).toBe(Math.min(50_000, want));
      score += out.points;
      const e = entry(db, t.id, "u2");
      expect(e.stack_cents + layout(t.id)).toBe(t.start_stack_cents + net);
      expect(e.score).toBe(score);
      expect(out.lastRoll).toBe(i === t.fixed_plays! - 1);
      if (out.lastRoll) expect(layout(t.id)).toBe(0);
    }
    unpace(db);
    expect(() => crapsTournament(db, "u2", t.id, { action: "roll" })).toThrow(/all 40 rolls/);
    expect(() => crapsTournament(db, "u2", t.id, { action: "bet", bet: { type: "field", amount: 100 } })).toThrow(/all 40 rolls/);
    const e = entry(db, t.id, "u2");
    expect(e.bets_made).toBe(40);
    expect(e.plays_used).toBe(40);
    expect(getBalance("u2")).toBe(wallet);
  });

  it("chips still on the felt at the end go back to the stack at finalize", () => {
    crapsTournament(db, "u2", t.id, { action: "bet", bet: { type: "pass", amount: 300 } });
    finalizeTournament(db, t.id, now());
    expect(entry(db, t.id, "u2").stack_cents).toBe(t.start_stack_cents);
  });
});
