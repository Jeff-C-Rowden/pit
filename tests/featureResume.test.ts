import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resetDbForTests, getDb } from "../src/lib/db";
import { createUser, loginUser } from "../src/lib/auth";
import { applyLedger, getBalance } from "../src/lib/ledger";
import { PR_CELLS, PR_HS_TRIGGER, holdFinalLaw, prCoinLaw, runHoldSpin, playPrairie, publicPrairieSpin, type Pick } from "../src/lib/games/prairie";
import { PRAIRIE_MATH, gameMath } from "../src/lib/gameMath";
import {
  FEATURE_RESUME_GAME, FEATURE_RESUME_MAX_AGE_MS, START_PROGRESS, fsWonBefore, holdBoardAt, holdLawFrom, holdOdds, isForward, pctText,
  resumeWhere, sanitizeProgress, type ResumableSpin,
} from "../src/lib/featureResume";
import { closeOpenFeatures, collectFeature, loadOpenFeature, openFeature, saveProgress } from "../src/lib/featureResumeStore";
import { POST as prPOST, GET as prGET } from "../src/app/api/games/prairie/route";

function seeded(seed: number): Pick {
  let s = seed >>> 0 || 1;
  return (n) => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return Math.floor((s / 4294967296) * n); };
}
const src = (p: string) => readFileSync(p, "utf8");

function featureSpin(want: "hold" | "fs", seed = 11) {
  const pick = seeded(seed);
  for (let i = 0; i < 400000; i++) {
    const s = playPrairie(25, pick);
    if (want === "hold" && s.hold && !s.freeSpins && s.hold.respins.length >= 3) return publicPrairieSpin(s);
    if (want === "fs" && s.freeSpins && !s.hold && s.freeSpins.spins.length >= 8) return publicPrairieSpin(s);
  }
  throw new Error("no feature found");
}

describe("live Hold & Spin odds (exact, from the visible board only)", () => {
  it("matches the published Markov chain from the trigger and every law sums to 1", () => {
    for (let n = PR_HS_TRIGGER; n <= PR_CELLS; n++) {
      const a = holdLawFrom(n, 3), b = holdFinalLaw(n);
      expect(a.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 12);
      a.forEach((p, i) => expect(p).toBeCloseTo(b[i]!, 12));
    }
  });
  it("trigger-weighted full-screen chance equals the published figure", () => {
    const law = prCoinLaw();
    let pTrig = 0, pFull = 0;
    for (let c = PR_HS_TRIGGER; c <= PR_CELLS; c++) { pTrig += law[c]!; pFull += law[c]! * holdOdds(c, 3).fullScreen; }
    expect(pTrig).toBeCloseTo(PRAIRIE_MATH.holdChance, 5);
    expect(pFull / pTrig).toBeCloseTo(PRAIRIE_MATH.holdFullScreenChance, 5);
  });
  it("next-coin chance is 1 - 0.95^empty; zero once the round is over", () => {
    expect(holdOdds(6, 3).nextCoin).toBeCloseTo(1 - 0.95 ** 9, 12);
    expect(holdOdds(14, 1).nextCoin).toBeCloseTo(0.05, 12);
    expect(holdOdds(8, 0)).toMatchObject({ nextCoin: 0, fullScreen: 0, expectedCoins: 8 });
    expect(holdOdds(15, 2)).toMatchObject({ nextCoin: 0, fullScreen: 1, expectedCoins: 15 });
  });
  it("agrees with 200,000 simulated rounds of the server's own runHoldSpin from mid-round", () => {
    const pick = seeded(5);
    const start = Array.from({ length: 7 }, (_, i) => ({ cell: i * 2, x: 1 }));
    let sumCoins = 0, full = 0;
    const N = 200000;
    for (let i = 0; i < N; i++) {
      const h = runHoldSpin(100, start, pick);
      const n = h.board.filter((v) => v !== null).length;
      sumCoins += n; if (h.full) full++;
    }
    const o = holdOdds(7, 3);
    expect(Math.abs(sumCoins / N - o.expectedCoins)).toBeLessThan(0.02);
    expect(Math.abs(full / N - o.fullScreen)).toBeLessThan(0.0006);
  });
  it("formats percentages plainly", () => {
    expect(pctText(0)).toBe("0%");
    expect(pctText(0.0004)).toBe("<0.1%");
    expect(pctText(0.0173)).toBe("1.7%");
    expect(pctText(0.3698)).toBe("37%");
    expect(pctText(1)).toBe("100%");
  });
  it("publishing odds doesn't move the math: RTP and volatility unchanged", () => {
    expect(PRAIRIE_MATH.rtp).toBe(0.9525);
    expect(gameMath("prairie")?.line).toMatch(/95\.25%.*Medium/);
  });
});

describe("resume progress validation", () => {
  const hold = featureSpin("hold") as unknown as ResumableSpin;
  const fs = featureSpin("fs") as unknown as ResumableSpin;
  it("accepts only places that exist in this spin", () => {
    expect(sanitizeProgress(hold, { phase: "hold", step: 2 })).toEqual({ phase: "hold", step: 2 });
    expect(sanitizeProgress(hold, { phase: "hold", step: hold.hold!.respins.length + 1 })).toBeNull();
    expect(sanitizeProgress(hold, { phase: "fs", step: 0 })).toBeNull();
    expect(sanitizeProgress(hold, { phase: "fsIntro", step: 0 })).toBeNull();
    expect(sanitizeProgress(fs, { phase: "holdDone", step: 0 })).toBeNull();
    expect(sanitizeProgress(fs, { phase: "fs", step: fs.freeSpins!.spins.length })).toBeNull();
    expect(sanitizeProgress(fs, { phase: "fs", step: 3 })).toEqual({ phase: "fs", step: 3 });
    for (const bad of [null, "x", { phase: "jackpot", step: 0 }, { phase: "hold", step: -1 }, { phase: "hold", step: 1.5 }, { phase: "summary", step: 2 }]) {
      expect(sanitizeProgress(hold, bad)).toBeNull();
    }
  });
  it("orders phases so a late save can never move a round backwards", () => {
    expect(isForward({ phase: "hold", step: 3 }, { phase: "hold", step: 2 })).toBe(false);
    expect(isForward({ phase: "hold", step: 3 }, { phase: "holdDone", step: 0 })).toBe(true);
    expect(isForward({ phase: "fs", step: 10 }, { phase: "fsIntro", step: 0 })).toBe(false);
    expect(isForward(START_PROGRESS, { phase: "summary", step: 0 })).toBe(true);
  });
  it("rebuilds the board and the free-spin tally from the server's spin", () => {
    const h = hold.hold!;
    expect(holdBoardAt(h, 0).coins).toBe(h.start.length);
    expect(holdBoardAt(h, h.respins.length).board).toEqual(h.board);
    expect(holdBoardAt(h, h.respins.length).totalX).toBe(h.totalX);
    expect(holdBoardAt(h, h.respins.length).left).toBe(h.respins[h.respins.length - 1]!.respinsLeft);
    expect(fsWonBefore(fs, fs.freeSpins!.spins.length)).toBe(fs.freeSpins!.totalWinCents);
    expect(fsWonBefore(fs, 0)).toBe(0);
    expect(resumeWhere(hold, { phase: "hold", step: 1 })).toMatch(/^respin 2, with \d+ coins locked and \d respins? left\.$/);
    expect(resumeWhere(fs, { phase: "fs", step: 4 })).toBe(`free spin 5 of ${fs.freeSpins!.spins.length}.`);
  });
});

describe("resume store (game_states, no money)", () => {
  let uid = "";
  beforeEach(() => {
    resetDbForTests();
    uid = createUser({ email: "r@pit.test", password: "password123", displayName: "R", ageConfirmed: true }).id;
  });
  it("opens, saves forward-only progress, collects, and never writes the ledger", () => {
    // a spin carrying both parts (hold + free spins), assembled from two real server spins
    const spin = { ...(featureSpin("hold") as unknown as ResumableSpin), freeSpins: (featureSpin("fs") as unknown as ResumableSpin).freeSpins };
    const db = getDb();
    const ledger0 = (db.prepare("SELECT COUNT(*) n FROM ledger").get() as { n: number }).n;
    openFeature(uid, spin, db);
    expect(loadOpenFeature(uid, db)?.progress).toEqual(START_PROGRESS);
    expect(saveProgress(uid, spin.id, { phase: "hold", step: 2 }, db)).toEqual({ phase: "hold", step: 2 });
    expect(saveProgress(uid, spin.id, { phase: "hold", step: 1 }, db)).toEqual({ phase: "hold", step: 2 });
    expect(saveProgress(uid, "other", { phase: "hold", step: 3 }, db)).toBeNull();
    expect(saveProgress(uid, spin.id, { phase: "fs", step: 0 }, db)).toEqual({ phase: "fs", step: 0 });
    expect(loadOpenFeature(uid, db)?.progress).toEqual({ phase: "fs", step: 0 });
    expect(loadOpenFeature(uid, db)?.spin).toEqual(spin);
    expect(collectFeature(uid, spin.id, db)).toBe(true);
    expect(loadOpenFeature(uid, db)).toBeNull();
    expect(collectFeature(uid, spin.id, db)).toBe(false);
    expect((db.prepare("SELECT COUNT(*) n FROM ledger").get() as { n: number }).n).toBe(ledger0);
  });
  it("a newer feature or a plain spin closes the old round; another player can't see it; stale rounds expire", () => {
    const a = featureSpin("hold", 3) as unknown as ResumableSpin, b = featureSpin("fs", 4) as unknown as ResumableSpin;
    const db = getDb();
    openFeature(uid, a, db);
    openFeature(uid, b, db);
    expect(loadOpenFeature(uid, db)?.spin.id).toBe(b.id);
    expect((db.prepare("SELECT COUNT(*) n FROM game_states WHERE user_id = ? AND game = ? AND status = 'open'").get(uid, FEATURE_RESUME_GAME) as { n: number }).n).toBe(1);
    const other = createUser({ email: "o@pit.test", password: "password123", displayName: "O", ageConfirmed: true }).id;
    expect(loadOpenFeature(other, db)).toBeNull();
    expect(saveProgress(other, b.id, { phase: "fs", step: 1 }, db)).toBeNull();
    closeOpenFeatures(uid, db);
    expect(loadOpenFeature(uid, db)).toBeNull();
    openFeature(uid, a, db, new Date("2026-11-01T00:00:00Z"));
    expect(loadOpenFeature(uid, db, Date.parse("2026-11-01T00:00:00Z") + FEATURE_RESUME_MAX_AGE_MS - 1)).not.toBeNull();
    expect(loadOpenFeature(uid, db, Date.parse("2026-11-01T00:00:00Z") + FEATURE_RESUME_MAX_AGE_MS + 1)).toBeNull();
    expect(loadOpenFeature(uid, db)).toBeNull();
  });
});

describe("/api/games/prairie resume endpoints", () => {
  let cookie = "", uid = "";
  beforeEach(() => {
    resetDbForTests();
    uid = createUser({ email: "p@pit.test", password: "password123", displayName: "P", ageConfirmed: true }).id;
    cookie = `pit_session=${loginUser("p@pit.test", "password123").token}`;
    applyLedger({ userId: uid, type: "deposit", amountCents: 2000000, idempotencyKey: "d" });
  });
  const post = (body: unknown, c = cookie) => prPOST(new Request("http://x/api/games/prairie", { method: "POST", headers: { cookie: c, "content-type": "application/json" }, body: JSON.stringify(body) }));
  const resume = (c = cookie) => prGET(new Request("http://x/api/games/prairie?resume=1", { headers: { cookie: c } }));

  it("needs sign-in; the public GET still publishes the math", async () => {
    expect((await resume("")).status).toBe(401);
    expect((await post({ action: "progress", spinId: "x", progress: START_PROGRESS }, "")).status).toBe(401);
    const g = await (await (prGET as unknown as () => Promise<Response>)()).json();
    expect(g.math.rtp).toBe(PRAIRIE_MATH.rtp);
  });

  it("a feature spin is saved as the server settled it, resumes at the watched place, and progress/collect never move money", async () => {
    let d: { spin: ResumableSpin & { winCents: number }; balanceCents: number } | null = null;
    let expected = 2000000;
    for (let i = 0; i < 3000 && !d; i++) {
      const r = await (await post({ coinCents: 25, idempotencyKey: `k${i}` })).json();
      expected += r.spin.winCents - 250;
      const g = await (await resume()).json();
      if (r.spin.hold || r.spin.freeSpins) d = r;
      else expect(g.feature).toBeNull();
    }
    expect(d).not.toBeNull();
    expect(getBalance(uid)).toBe(expected);
    const g = await (await resume()).json();
    expect(g.feature.spin).toEqual(d!.spin);
    expect(g.feature.progress).toEqual(START_PROGRESS);
    expect(g.user.balanceCents).toBe(expected);
    const place = d!.spin.hold ? { phase: "hold", step: 1 } : { phase: "fs", step: 0 };
    const pr = await post({ action: "progress", spinId: d!.spin.id, progress: place });
    expect((await pr.json()).progress).toEqual(place);
    expect((await post({ action: "progress", spinId: d!.spin.id, progress: { phase: "nope", step: 0 } })).status).toBe(404);
    expect((await (await resume()).json()).feature.progress).toEqual(place);
    expect((await (await post({ action: "collect", spinId: d!.spin.id })).json()).ok).toBe(true);
    expect((await (await resume()).json()).feature).toBeNull();
    expect(getBalance(uid)).toBe(expected);
    const bets = getDb().prepare("SELECT COUNT(*) n FROM ledger WHERE user_id = ? AND type = 'bet'").get(uid) as { n: number };
    const pays = getDb().prepare("SELECT COALESCE(SUM(amount_cents),0) s FROM ledger WHERE user_id = ? AND game = 'prairie'").get(uid) as { s: number };
    expect(pays.s).toBe(expected - 2000000);
    expect(bets.n).toBeGreaterThan(0);
  });
});

describe("Prairie page wiring (source)", () => {
  const page = src("src/app/prairie/page.tsx");
  const lib = src("src/lib/featureResume.ts") + src("src/lib/featureResumeStore.ts");
  it("asks the server where it was, shows a player-paced welcome-back card and saves its place", () => {
    expect(page).toMatch(/\/api\/games\/prairie\?resume=1/);
    expect(page).toMatch(/testId="bonus-resume"/);
    expect(page).toMatch(/RESUME_NOTE/);
    expect(page).toMatch(/action: "progress"/);
    expect(page).toMatch(/action: "collect"/);
    expect(page).toMatch(/data-testid="hold-odds"/);
    expect(page).toMatch(/runHold\(r\.progress\.step\)/);
  });
  it("draws nothing: no randomness and no ledger writes in the resume code", () => {
    expect(lib).not.toMatch(/Math\.random|randInt|getRandomValues|creditPayout|debitBet|applyLedger/);
  });
});
