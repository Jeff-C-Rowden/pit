import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resetDbForTests, getDb } from "../src/lib/db";
import { createUser, loginUser } from "../src/lib/auth";
import { applyLedger, getBalance } from "../src/lib/ledger";
import { playMine, publicMineSpin, MINE_PICK_CARTS, type Pick } from "../src/lib/games/mine";
import { playClover, publicCloverSpin } from "../src/lib/games/clover";
import { MINE_MATH, CLOVER_MATH } from "../src/lib/gameMath";
import { FEATURE_RESUME_GAME, isForwardIn } from "../src/lib/featureResume";
import { featureStore, openFeature as prairieOpen, loadOpenFeature as prairieLoad } from "../src/lib/featureResumeStore";
import {
  CLOVER_RESUME, CLOVER_RESUME_GAME, CLOVER_RESUME_PHASES, MINE_RESUME, MINE_RESUME_GAME, MINE_RESUME_PHASES,
  cloverResumeWhere, minePickedCarts, mineResumeWhere, sanitizeCloverProgress, sanitizeMineProgress, wonBefore,
  type CloverResumable, type MineResumable,
} from "../src/lib/featureResumeSlots";
import { POST as mnPOST, GET as mnGET } from "../src/app/api/games/mine/route";
import { POST as clPOST, GET as clGET } from "../src/app/api/games/clover/route";

function seeded(seed: number): Pick {
  let s = seed >>> 0 || 1;
  return (n) => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return Math.floor((s / 4294967296) * n); };
}
const src = (p: string) => readFileSync(p, "utf8");

type MinePub = ReturnType<typeof publicMineSpin>;
type CloverPub = ReturnType<typeof publicCloverSpin>;
function mineSpin(want: "pick" | "fs", seed = 7): MinePub {
  const pick = seeded(seed);
  for (let i = 0; i < 400000; i++) {
    const s = playMine(25, pick);
    if (want === "pick" && s.pick && !s.freeSpins && s.pick.reveals.length >= 3) return publicMineSpin(s);
    if (want === "fs" && s.freeSpins && !s.pick && s.freeSpins.spins.length >= 8) return publicMineSpin(s);
  }
  throw new Error("no mine feature");
}
function cloverSpin(want: "wheelFs" | "wheelCredit" | "kettle", seed = 9): CloverPub {
  const pick = seeded(seed);
  for (let i = 0; i < 600000; i++) {
    const s = playClover(25, pick);
    if (want === "wheelFs" && s.wheel?.freeSpins && !s.freeSpins && s.wheel.freeSpins.spins.length >= 6) return publicCloverSpin(s);
    if (want === "wheelCredit" && s.wheel && !s.wheel.freeSpins && !s.freeSpins) return publicCloverSpin(s);
    if (want === "kettle" && s.freeSpins && !s.wheel && s.freeSpins.spins.length >= 6) return publicCloverSpin(s);
  }
  throw new Error("no clover feature");
}
const asMine = (s: MinePub) => s as unknown as MineResumable;
const asClover = (s: CloverPub) => s as unknown as CloverResumable;

describe("Canary Creek Mine resume progress", () => {
  const pk = asMine(mineSpin("pick")), fs = asMine(mineSpin("fs"));
  const both = { ...pk, freeSpins: fs.freeSpins };
  it("accepts only places that exist in this spin, with valid cart positions", () => {
    expect(sanitizeMineProgress(pk, { phase: "pick", step: 2, picked: [5, 0] })).toEqual({ phase: "pick", step: 2, picked: [5, 0] });
    expect(sanitizeMineProgress(pk, { phase: "pick", step: 1 })).toEqual({ phase: "pick", step: 1 });
    expect(sanitizeMineProgress(pk, { phase: "pick", step: pk.pick!.reveals.length })).not.toBeNull();
    expect(sanitizeMineProgress(pk, { phase: "pick", step: pk.pick!.reveals.length + 1 })).toBeNull();
    expect(sanitizeMineProgress(pk, { phase: "pick", step: 2, picked: [1, 1] })).toBeNull();
    expect(sanitizeMineProgress(pk, { phase: "pick", step: 2, picked: [1] })).toBeNull();
    expect(sanitizeMineProgress(pk, { phase: "pick", step: 1, picked: [MINE_PICK_CARTS] })).toBeNull();
    expect(sanitizeMineProgress(pk, { phase: "fs", step: 0 })).toBeNull();
    expect(sanitizeMineProgress(pk, { phase: "fsIntro", step: 0 })).toBeNull();
    expect(sanitizeMineProgress(both, { phase: "fsIntro", step: 0 })).toEqual({ phase: "fsIntro", step: 0 });
    expect(sanitizeMineProgress(fs, { phase: "pick", step: 0 })).toBeNull();
    expect(sanitizeMineProgress(fs, { phase: "fs", step: fs.freeSpins!.spins.length })).toBeNull();
    expect(sanitizeMineProgress(fs, { phase: "fs", step: 5 })).toEqual({ phase: "fs", step: 5 });
    for (const bad of [null, 7, { phase: "jackpot", step: 0 }, { phase: "fs", step: -1 }, { phase: "fs", step: 0.5 }, { phase: "summary", step: 1 }, { phase: "intro", step: 1 }]) {
      expect(sanitizeMineProgress(fs, bad)).toBeNull();
    }
  });
  it("plays pick → free-spin intro → free spins → summary, forward only", () => {
    const P = MINE_RESUME_PHASES;
    expect(isForwardIn(P, { phase: "pick", step: 3 }, { phase: "pick", step: 2 })).toBe(false);
    expect(isForwardIn(P, { phase: "pick", step: 3 }, { phase: "fsIntro", step: 0 })).toBe(true);
    expect(isForwardIn(P, { phase: "fs", step: 5 }, { phase: "pick", step: 9 })).toBe(false);
    expect(isForwardIn(P, { phase: "intro", step: 0 }, { phase: "summary", step: 0 })).toBe(true);
  });
  it("describes the place and rebuilds the opened carts and free-spin tally from the server's spin", () => {
    const x2 = pk.pick!.reveals.slice(0, 2).reduce((a, it) => a + (it.kind === "prize" ? it.x : 0), 0);
    expect(mineResumeWhere(pk, { phase: "pick", step: 2 })).toBe(`the Mine Cart pick, with 2 carts opened and ${x2}× bet found so far.`);
    expect(mineResumeWhere(pk, { phase: "pick", step: 0 })).toMatch(/no carts opened/);
    expect(mineResumeWhere(fs, { phase: "fs", step: 4 })).toBe(`free spin 5 of ${fs.freeSpins!.spins.length}.`);
    expect(minePickedCarts({ phase: "pick", step: 2, picked: [7, 3] })).toEqual([7, 3]);
    expect(minePickedCarts({ phase: "pick", step: 2 })).toEqual([0, 1]);
    expect(minePickedCarts({ phase: "fs", step: 2 })).toEqual([]);
    expect(wonBefore(fs.freeSpins, fs.freeSpins!.spins.length)).toBe(fs.freeSpins!.totalWinCents);
    expect(wonBefore(fs.freeSpins, 0)).toBe(0);
  });
});

describe("Kettle of Clover resume progress", () => {
  const wf = asClover(cloverSpin("wheelFs")), wc = asClover(cloverSpin("wheelCredit")), k = asClover(cloverSpin("kettle"));
  const both = { ...wf, freeSpins: k.freeSpins };
  it("accepts only places that exist in this spin", () => {
    expect(sanitizeCloverProgress(wc, { phase: "intro", step: 0 })).toEqual({ phase: "intro", step: 0 });
    expect(sanitizeCloverProgress(wc, { phase: "wheelFs", step: 0 })).toBeNull();
    expect(sanitizeCloverProgress(wf, { phase: "wheelFs", step: 3 })).toEqual({ phase: "wheelFs", step: 3 });
    expect(sanitizeCloverProgress(wf, { phase: "wheelFs", step: wf.wheel!.freeSpins!.spins.length })).toBeNull();
    expect(sanitizeCloverProgress(wf, { phase: "kettleFs", step: 0 })).toBeNull();
    expect(sanitizeCloverProgress(k, { phase: "kettleIntro", step: 0 })).toBeNull();
    expect(sanitizeCloverProgress(both, { phase: "kettleIntro", step: 0 })).toEqual({ phase: "kettleIntro", step: 0 });
    expect(sanitizeCloverProgress(k, { phase: "kettleFs", step: 5 })).toEqual({ phase: "kettleFs", step: 5 });
    for (const bad of [undefined, "x", { phase: "wheel", step: 0 }, { phase: "kettleFs", step: -2 }, { phase: "summary", step: 3 }]) {
      expect(sanitizeCloverProgress(k, bad)).toBeNull();
    }
  });
  it("plays wheel free spins → kettle intro → kettle free spins → summary, forward only", () => {
    const P = CLOVER_RESUME_PHASES;
    expect(isForwardIn(P, { phase: "wheelFs", step: 5 }, { phase: "kettleIntro", step: 0 })).toBe(true);
    expect(isForwardIn(P, { phase: "kettleFs", step: 0 }, { phase: "wheelFs", step: 9 })).toBe(false);
    expect(isForwardIn(P, { phase: "kettleFs", step: 5 }, { phase: "kettleFs", step: 0 })).toBe(false);
  });
  it("describes the place in plain words", () => {
    expect(cloverResumeWhere(wf, { phase: "wheelFs", step: 2 })).toBe(`wheel free spin 3 of ${wf.wheel!.freeSpins!.spins.length}.`);
    expect(cloverResumeWhere(k, { phase: "kettleFs", step: 0 })).toBe(`free spin 1 of ${k.freeSpins!.spins.length}.`);
    expect(cloverResumeWhere(both, { phase: "kettleIntro", step: 0 })).toMatch(/Rainbow Wheel is done/);
  });
});

describe("one store, separate rounds per cabinet (game_states, no money)", () => {
  let uid = "";
  beforeEach(() => {
    resetDbForTests();
    uid = createUser({ email: "s@pit.test", password: "password123", displayName: "S", ageConfirmed: true }).id;
  });
  it("Mine: opens, saves forward-only cart progress, collects; the ledger never moves", () => {
    const store = featureStore(MINE_RESUME);
    const spin = { ...asMine(mineSpin("pick")), freeSpins: asMine(mineSpin("fs")).freeSpins };
    const db = getDb();
    const ledger0 = (db.prepare("SELECT COUNT(*) n FROM ledger").get() as { n: number }).n;
    store.openFeature(uid, spin, db);
    expect(store.loadOpenFeature(uid, db)?.progress).toEqual({ phase: "intro", step: 0 });
    expect(store.saveProgress(uid, spin.id, { phase: "pick", step: 2, picked: [4, 9] }, db)).toEqual({ phase: "pick", step: 2, picked: [4, 9] });
    expect(store.saveProgress(uid, spin.id, { phase: "pick", step: 1, picked: [4] }, db)).toEqual({ phase: "pick", step: 2, picked: [4, 9] });
    expect(store.saveProgress(uid, spin.id, { phase: "pick", step: 2, picked: [4, 4] }, db)).toBeNull();
    expect(store.saveProgress(uid, spin.id, { phase: "fs", step: 5 }, db)).toEqual({ phase: "fs", step: 5 });
    expect(store.loadOpenFeature(uid, db)?.spin).toEqual(spin);
    expect(store.collectFeature(uid, spin.id, db)).toBe(true);
    expect(store.loadOpenFeature(uid, db)).toBeNull();
    expect((db.prepare("SELECT COUNT(*) n FROM ledger").get() as { n: number }).n).toBe(ledger0);
    expect((db.prepare("SELECT game FROM game_states WHERE user_id = ?").get(uid) as { game: string }).game).toBe(MINE_RESUME_GAME);
  });
  it("a Mine, a Clover and a Prairie round live side by side; each cabinet only closes its own", () => {
    const mine = featureStore(MINE_RESUME), clover = featureStore(CLOVER_RESUME);
    const m = asMine(mineSpin("fs", 3)), c = asClover(cloverSpin("kettle", 4));
    const db = getDb();
    const prairieSpin = { id: "pr1", betCents: 250, winCents: 0, hold: null, freeSpins: { initial: 8, spins: [{ winCents: 0 }], totalWinCents: 0, capped: false } };
    prairieOpen(uid, prairieSpin, db);
    mine.openFeature(uid, m, db);
    clover.openFeature(uid, c, db);
    mine.closeOpenFeatures(uid, db); // a plain Mine spin
    expect(mine.loadOpenFeature(uid, db)).toBeNull();
    expect(clover.loadOpenFeature(uid, db)?.spin.id).toBe(c.id);
    expect(prairieLoad(uid, db)?.spin.id).toBe("pr1");
    const games = (db.prepare("SELECT game FROM game_states WHERE user_id = ? AND status = 'open' ORDER BY game").all(uid) as { game: string }[]).map((r) => r.game);
    expect(games).toEqual([CLOVER_RESUME_GAME, FEATURE_RESUME_GAME]);
    const other = createUser({ email: "o2@pit.test", password: "password123", displayName: "O", ageConfirmed: true }).id;
    expect(clover.loadOpenFeature(other, db)).toBeNull();
    expect(clover.saveProgress(other, c.id, { phase: "kettleFs", step: 0 }, db)).toBeNull();
    expect(mine.saveProgress(uid, c.id, { phase: "fs", step: 0 }, db)).toBeNull();
  });
});

type Route = (req: Request) => Promise<Response>;
for (const g of [
  { game: "mine", POST: mnPOST as unknown as Route, GET: mnGET as unknown as Route, bet: 225, has: (s: { pick?: unknown; freeSpins?: unknown }) => !!(s.pick || s.freeSpins), math: MINE_MATH,
    place: (s: MinePub) => (s.pick ? { phase: "pick", step: 1, picked: [6] } : { phase: "fs", step: 0 }) },
  { game: "clover", POST: clPOST as unknown as Route, GET: clGET as unknown as Route, bet: 250, has: (s: { wheel?: unknown; freeSpins?: unknown }) => !!(s.wheel || s.freeSpins), math: CLOVER_MATH,
    place: (s: CloverPub) => (s.wheel?.freeSpins ? { phase: "wheelFs", step: 0 } : s.freeSpins ? { phase: "kettleFs", step: 0 } : { phase: "summary", step: 0 }) },
] as const) {
  describe(`/api/games/${g.game} resume endpoints`, () => {
    let cookie = "", uid = "";
    beforeEach(() => {
      resetDbForTests();
      uid = createUser({ email: `${g.game}@pit.test`, password: "password123", displayName: "G", ageConfirmed: true }).id;
      cookie = `pit_session=${loginUser(`${g.game}@pit.test`, "password123").token}`;
      applyLedger({ userId: uid, type: "deposit", amountCents: 2000000, idempotencyKey: "d" });
    });
    const post = (body: unknown, c = cookie) => g.POST(new Request(`http://x/api/games/${g.game}`, { method: "POST", headers: { cookie: c, "content-type": "application/json" }, body: JSON.stringify(body) }));
    const resume = (c = cookie) => g.GET(new Request(`http://x/api/games/${g.game}?resume=1`, { headers: { cookie: c } }));

    it("needs sign-in; the public GET still publishes the math", async () => {
      expect((await resume("")).status).toBe(401);
      expect((await post({ action: "collect", spinId: "x" }, "")).status).toBe(401);
      const pub = await (await (g.GET as unknown as () => Promise<Response>)()).json();
      expect(pub.math.rtp).toBe(g.math.rtp);
    });

    it("a feature spin is saved as settled, resumes at the watched place, and progress/collect never move money", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let d: any = null;
      let expected = 2000000;
      for (let i = 0; i < 4000 && !d; i++) {
        const r = await (await post({ coinCents: 25, idempotencyKey: `k${i}` })).json();
        expected += r.spin.winCents - g.bet;
        if (g.has(r.spin)) d = r;
        else expect((await (await resume()).json()).feature).toBeNull();
      }
      expect(d).not.toBeNull();
      expect(getBalance(uid)).toBe(expected);
      const r0 = await (await resume()).json();
      expect(r0.feature.spin).toEqual(d.spin);
      expect(r0.feature.progress).toEqual({ phase: "intro", step: 0 });
      expect(r0.user.balanceCents).toBe(expected);
      const place = g.place(d.spin);
      expect((await (await post({ action: "progress", spinId: d.spin.id, progress: place })).json()).progress).toEqual(place);
      expect((await post({ action: "progress", spinId: d.spin.id, progress: { phase: "hold", step: 0 } })).status).toBe(404);
      expect((await post({ action: "progress", spinId: "someone-else", progress: place })).status).toBe(404);
      expect((await (await resume()).json()).feature.progress).toEqual(place);
      expect((await (await post({ action: "collect", spinId: d.spin.id })).json()).ok).toBe(true);
      expect((await (await resume()).json()).feature).toBeNull();
      expect(getBalance(uid)).toBe(expected);
      const sum = getDb().prepare("SELECT COALESCE(SUM(amount_cents),0) s FROM ledger WHERE user_id = ? AND game = ?").get(uid, g.game) as { s: number };
      expect(sum.s).toBe(expected - 2000000);
    });
  });
}

describe("Mine and Clover page wiring (source)", () => {
  const lib = src("src/lib/featureResumeSlots.ts") + src("src/lib/featureResumeStore.ts");
  for (const game of ["mine", "clover"]) {
    const page = src(`src/app/${game}/page.tsx`);
    it(`${game}: asks the server where it was, shows the player-paced welcome-back card, saves and collects`, () => {
      expect(page).toMatch(new RegExp(`/api/games/${game}\\?resume=1`));
      expect(page).toMatch(/testId="bonus-resume"/);
      expect(page).toMatch(/RESUME_NOTE/);
      expect(page).toMatch(/action: "progress"/);
      expect(page).toMatch(/action: "collect"/);
      expect(page).toMatch(/credit\.accept\(d\.user, f\.spin\)/);
    });
  }
  it("Mine's pick board reopens the same carts", () => {
    expect(src("src/app/mine/page.tsx")).toMatch(/initialOpened=\{pickStart\}/);
  });
  it("draws nothing: no randomness and no ledger writes in the resume code", () => {
    expect(lib).not.toMatch(/Math\.random|randInt|getRandomValues|creditPayout|debitBet|applyLedger/);
  });
  it("RTPs are the published figures (Mine re-tuned by slice 3's Lantern Multiplier)", () => {
    expect(MINE_MATH.rtp).toBe(0.957579);
    expect(CLOVER_MATH.rtp).toBe(0.953549);
  });
});
