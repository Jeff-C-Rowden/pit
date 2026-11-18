import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resetDbForTests, getDb } from "../src/lib/db";
import { createUser, loginUser } from "../src/lib/auth";
import { applyLedger, debitBet, creditPayout } from "../src/lib/ledger";
import {
  BESTS_COPY, BESTS_MACHINES, bestsMachine, bonusKindsFor, derivePersonalBests, featureTag, personalBestsFor, type BestsRow,
} from "../src/lib/personalBests";
import { GET as bestsGET } from "../src/app/api/bests/route";
import { POST as minePOST } from "../src/app/api/games/mine/route";
import { POST as cloverPOST } from "../src/app/api/games/clover/route";
import { POST as prairiePOST } from "../src/app/api/games/prairie/route";
import { POST as slotPOST } from "../src/app/api/games/slot/route";

type Route = (req: Request) => Promise<Response>;
const src = (p: string) => readFileSync(p, "utf8");
let t = 0;
const row = (type: string, amount: number, ref: string | null, meta: unknown = null): BestsRow => ({
  type, amount_cents: amount, ref, meta: meta == null ? null : JSON.stringify(meta),
  created_at: new Date(Date.UTC(2026, 10, 10, 12, 0, t++)).toISOString(),
});

describe("derivePersonalBests (pure)", () => {
  const slot = BESTS_MACHINES.slot!;
  it("no rows: nothing shown, nothing invented", () => {
    const b = derivePersonalBests(slot, []);
    expect(b.count).toBe(0);
    expect(b.biggestWin).toBeNull();
    expect(b.bonuses).toBeNull(); // Sundown Trail has no bonus round
    expect(b.firstAt).toBeNull();
    expect(derivePersonalBests(BESTS_MACHINES.mine!, []).bonuses).toEqual({ total: 0, byKind: [] });
  });
  it("slot: spins = distinct bet refs; biggest win = most one spin paid (cash + bonus rows), with its bet", () => {
    const rows = [
      row("bet", -90, "a"), row("payout", 45, "a"),
      row("bet", -60, "b"), row("bet", -30, "b", { funded: { cashCents: 60, bonusCents: 30 } }), row("payout", 300, "b"), row("payout", 150, "b"),
      row("bet", -90, "c"),
      row("payout", 99999, "stray"), // payout with no bet on this machine is ignored
      row("deposit", 5000, null), row("promo", 500, "x"),
    ];
    const b = derivePersonalBests(slot, rows);
    expect(b.count).toBe(3);
    expect(b.biggestWin?.cents).toBe(450);
    expect(b.biggestWin?.betCents).toBe(90);
    expect(b.firstAt).toBe(rows[0]!.created_at);
  });
  it("slot: a spin that paid less than its bet still counts as its pay; zero-pay spins never become a win", () => {
    const b = derivePersonalBests(slot, [row("bet", -90, "a"), row("payout", 20, "a")]);
    expect(b.biggestWin?.cents).toBe(20);
    expect(derivePersonalBests(slot, [row("bet", -90, "a"), row("bet", -90, "b")]).biggestWin).toBeNull();
  });
  it("tables: biggest win is the amount won on top of the stake in one round; pushes and losses are not wins", () => {
    const bj = BESTS_MACHINES.blackjack!;
    const b = derivePersonalBests(bj, [
      row("bet", -1000, "h1"), row("bet", -1000, "h1", { action: "double" }), row("payout", 4000, "h1"), // +2000
      row("bet", -500, "h2"), row("payout", 500, "h2"), // push
      row("bet", -2500, "h3"), // loss
      row("bet", -500, "h4"), row("payout", 1250, "h4"), // +750
    ]);
    expect(b.count).toBe(4);
    expect(b.countLabel).toBe("Hands played");
    expect(b.biggestWin).toMatchObject({ cents: 2000, betCents: 2000 });
    expect(derivePersonalBests(bj, [row("bet", -500, "p"), row("payout", 500, "p")]).biggestWin).toBeNull();
  });
  it("craps: bets placed minus undos; biggest win from the server's wonCents on each roll payout", () => {
    const c = derivePersonalBests(BESTS_MACHINES.craps!, [
      row("bet", -500, "T"), row("bet", -500, "T"), row("refund", 500, "T"), row("bet", -1000, "T"),
      row("payout", 1000, "T-k1", { stakeBackCents: 500, wonCents: 500 }),
      row("payout", 3000, "T-k2", { stakeBackCents: 1000, wonCents: 2000 }),
    ]);
    expect(c.count).toBe(2);
    expect(c.biggestWin).toMatchObject({ cents: 2000, betCents: null });
  });
  it("bonus kinds come only from what the server wrote on the spin's rows", () => {
    expect(bonusKindsFor("mine", [{ coinCents: 25 }, { freeSpins: 0, picks: 0 }])).toEqual([]);
    expect(bonusKindsFor("mine", [{ features: ["pick"] }])).toEqual(["Pick bonus"]);
    expect(bonusKindsFor("mine", [{}, { freeSpins: 7, picks: 3 }]).sort()).toEqual(["Free spins", "Pick bonus"]);
    expect(bonusKindsFor("clover", [{ wheelInner: 2, freeSpins: 0 }])).toEqual(["Wheel bonus"]);
    expect(bonusKindsFor("prairie", [{ features: ["freeSpins", "hold"] }]).sort()).toEqual(["Free spins", "Hold & spin"]);
    expect(bonusKindsFor("jackpot", [{ progressiveHits: [{ tierId: "mini" }], progressiveAwardCents: 2000 }])).toEqual(["Jackpot"]);
    expect(bonusKindsFor("jackpot", [{ progressiveHits: [], progressiveAwardCents: 0 }])).toEqual([]);
    expect(bonusKindsFor(null, [{ freeSpins: 9 }])).toEqual([]);
    // a bonus spin counts once even with both a bet tag and payout meta
    const b = derivePersonalBests(BESTS_MACHINES.mine!, [
      row("bet", -225, "s1", { features: ["freeSpins"] }), row("payout", 900, "s1", { freeSpins: 7, picks: 0 }),
      row("bet", -225, "s2", { features: ["freeSpins"] }), // zero-pay bonus still counted via the bet tag
      row("bet", -225, "s3"), row("payout", 50, "s3", { freeSpins: 0, picks: 0 }),
      row("payout", 5000, "s4", { picks: 3 }), // payout with no bet: not a spin here, not a bonus
    ]);
    expect(b.count).toBe(3);
    expect(b.bonuses).toEqual({ total: 2, byKind: [{ name: "Free spins", count: 2 }] });
  });
  it("malformed meta and rows are skipped, never guessed", () => {
    const b = derivePersonalBests(slot, [
      { type: "bet", amount_cents: -90, ref: "a", meta: "{not json", created_at: "2026-11-10T00:00:00Z" },
      { type: "bet", amount_cents: 1.5, ref: "b", meta: null, created_at: "2026-11-10T00:00:00Z" },
      { type: "bet", amount_cents: -90, ref: null, meta: null, created_at: "2026-11-10T00:00:00Z" },
    ]);
    expect(b.count).toBe(1);
  });
  it("featureTag only tags real feature names", () => {
    expect(featureTag([null, undefined, false])).toEqual({});
    expect(featureTag(["freeSpins", null, "pick"])).toEqual({ features: ["freeSpins", "pick"] });
  });
  it("every page machine maps to a real ledger game; unknown ids are refused", () => {
    expect(Object.keys(BESTS_MACHINES).sort()).toEqual(["blackjack", "bounty", "buckshot", "clover", "craps", "holdem", "mine", "paigow", "prairie", "roulette", "slot", "vault"]);
    expect(bestsMachine("vault")?.ledgerGame).toBe("vault-spire");
    expect(bestsMachine("__proto__")).toBeNull();
    expect(bestsMachine("nope")).toBeNull();
    for (const g of Object.keys(BESTS_MACHINES)) {
      const file = g === "buckshot" || g === "bounty" ? "src/components/BuckshotGame.tsx" : `src/app/${g}/page.tsx`;
      expect(src(file)).toMatch(g === "buckshot" || g === "bounty" ? /<YourBests game=\{variant\} \/>/ : new RegExp(`<YourBests game="${g}" />`));
    }
  });
});

describe("personalBestsFor on the real ledger (in-memory DB)", () => {
  let a = "", b = "";
  beforeEach(() => {
    resetDbForTests();
    a = createUser({ email: "a@pit.test", password: "password123", displayName: "A", ageConfirmed: true }).id;
    b = createUser({ email: "b@pit.test", password: "password123", displayName: "B", ageConfirmed: true }).id;
    applyLedger({ userId: a, type: "deposit", amountCents: 100000, idempotencyKey: "da" });
    applyLedger({ userId: b, type: "deposit", amountCents: 100000, idempotencyKey: "db" });
  });
  it("reads only the asking player's rows for that machine", () => {
    debitBet(a, 1000, "roulette", "r1", "k1"); creditPayout(a, 3600, "roulette", "r1", "p1");
    debitBet(b, 1000, "roulette", "r2", "k2"); creditPayout(b, 36000 - 1000 * 0, "roulette", "r2", "p2");
    debitBet(a, 500, "blackjack", "h1", "k3");
    const ra = personalBestsFor(getDb(), a, BESTS_MACHINES.roulette!);
    expect(ra.count).toBe(1);
    expect(ra.biggestWin?.cents).toBe(2600);
    expect(personalBestsFor(getDb(), b, BESTS_MACHINES.roulette!).biggestWin?.cents).toBe(35000);
    expect(personalBestsFor(getDb(), a, BESTS_MACHINES.blackjack!).count).toBe(1);
    expect(personalBestsFor(getDb(), b, BESTS_MACHINES.blackjack!).count).toBe(0);
  });
});

describe("/api/bests matches real spins through the real game routes", () => {
  let cookie = "", other = "";
  beforeEach(() => {
    resetDbForTests();
    const uid = createUser({ email: "p@pit.test", password: "password123", displayName: "P", ageConfirmed: true }).id;
    createUser({ email: "q@pit.test", password: "password123", displayName: "Q", ageConfirmed: true });
    cookie = `pit_session=${loginUser("p@pit.test", "password123").token}`;
    other = `pit_session=${loginUser("q@pit.test", "password123").token}`;
    applyLedger({ userId: uid, type: "deposit", amountCents: 5000000, idempotencyKey: "d" });
  });
  const get = (game: string, c = cookie) => (bestsGET as unknown as Route)(new Request(`http://x/api/bests?game=${game}`, { headers: { cookie: c } }));

  it("needs sign-in, refuses unknown machines, is private + no-store", async () => {
    expect((await get("slot", "")).status).toBe(401);
    expect((await get("lobby")).status).toBe(404);
    const r = await get("slot");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    const d = await r.json();
    expect(d.sandbox).toBe(true);
    expect(d.bests.count).toBe(0);
    expect(JSON.stringify(d)).not.toMatch(/rank|leader|percentile|others|average player/i);
  });

  for (const g of [
    { id: "mine", POST: minePOST, has: (s: any) => [s.freeSpins && "Free spins", s.pick && "Pick bonus"].filter(Boolean) },
    { id: "clover", POST: cloverPOST, has: (s: any) => [s.freeSpins && "Free spins", s.wheel && "Wheel bonus"].filter(Boolean) },
    { id: "prairie", POST: prairiePOST, has: (s: any) => [s.freeSpins && "Free spins", s.hold && "Hold & spin"].filter(Boolean) },
    { id: "slot", POST: slotPOST, has: () => [] },
  ]) {
    it(`${g.id}: spins, biggest win and bonuses equal what the server actually settled`, async () => {
      let spins = 0, best = 0, bestBet = 0, bonus = 0;
      const kinds: Record<string, number> = {};
      const N = g.id === "slot" ? 150 : 400;
      for (let i = 0; i < N || (g.id !== "slot" && bonus < 2 && i < 6000); i++) {
        const r = await (g.POST as unknown as Route)(new Request(`http://x/api/games/${g.id}`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ coinCents: 25, idempotencyKey: `k${i}` }) }));
        const j = await r.json();
        expect(r.status, JSON.stringify(j)).toBe(200);
        const s = j.spin;
        spins++;
        if (s.winCents > best) { best = s.winCents; bestBet = s.betCents; }
        const ks = g.has(s) as string[];
        if (ks.length) { bonus++; for (const k of ks) kinds[k] = (kinds[k] ?? 0) + 1; }
      }
      if (g.id !== "slot") expect(bonus).toBeGreaterThanOrEqual(2);
      const d = (await (await get(g.id)).json()).bests;
      expect(d.count).toBe(spins);
      if (best > 0) expect(d.biggestWin).toMatchObject({ cents: best, betCents: bestBet });
      else expect(d.biggestWin).toBeNull();
      if (g.id === "slot") expect(d.bonuses).toBeNull();
      else {
        expect(d.bonuses.total).toBe(bonus);
        expect(Object.fromEntries(d.bonuses.byKind.map((k: any) => [k.name, k.count]))).toEqual(kinds);
      }
      // the other player sees none of it
      const o = (await (await get(g.id, other)).json()).bests;
      expect(o.count).toBe(0);
      expect(o.biggestWin).toBeNull();
    }, 60_000);
  }
});

describe("wording sweep: private, calm, no pressure", () => {
  const BANNED = [
    /\bbeat\b/i, /\bstreak/i, /\bdaily\b/i, /\bgoal/i, /leaderboard/i, /\brank/i, /\bcompare(d)? (to|with) others/i,
    /\btop\b/i, /challenge/i, /\bcan you\b/i, /\btry (to|again for)\b/i, /next time/i, /keep (going|spinning|playing)/i,
    /\balmost\b/i, /so close/i, /new (best|record)/i, /\brecord\b/i, /\bhot\b/i, /\bdue\b/i, /\blucky\b/i,
    /don'?t stop/i, /\bunlock/i, /\blevel up/i, /\bpercentile/i, /\bbetter than\b/i, /\bchase/i,
  ];
  const copy = Object.values(BESTS_COPY).map((v) => (typeof v === "function" ? (v as (a: string, b: string) => string)("$1.00", "Nov 12") : v)).join(" \n ");
  const component = src("src/components/YourBests.tsx").replace(/className="[^"]*"/g, "").replace(/data-testid="[^"]*"/g, "");
  const lib = src("src/lib/personalBests.ts").split("export const BESTS_COPY")[1]!;
  it.each(BANNED.map((re) => [re]))("no %s in the panel copy", (re) => {
    expect(copy).not.toMatch(re);
    expect(component).not.toMatch(re);
    expect(lib).not.toMatch(re);
  });
  it("says it's private, keeps the sandbox chip and the responsible-play basics", () => {
    expect(copy).toMatch(/Only you can see this/);
    expect(copy).toMatch(/never compared/);
    expect(component).toContain("<SandboxChip");
    expect(component).toContain('href="/wallet#time"');
    expect(component).toMatch(/1-800-GAMBLER · 21\+/);
  });
  it("opens only on a tap and never pops up or toasts by itself", () => {
    expect(component).toMatch(/useState\(false\)/);
    expect(component).not.toMatch(/role="alert"|setInterval|toast|vibrate|confetti/i);
  });
});
