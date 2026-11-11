import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resetDbForTests, getDb } from "../src/lib/db";
import { createUser, loginUser } from "../src/lib/auth";
import { applyLedger, getBalance } from "../src/lib/ledger";
import {
  MINE_REELS, MINE_REEL_LEN, MINE_PAYTABLE, MINE_FS_CAP, MINE_PICK_PRIZES, MINE_PICK_COLLECTS,
  evaluateMineLine, evaluateMineGrid, mineWindow, runFreeSpins, drawPick, playMine,
  mineExact, mineEnumerate, mineExactFull, pickExpectedX, pickSecondMoment, expectedFreeSpins, scatterLaw, cartProbExact,
  type MineSymbol, type Pick,
} from "../src/lib/games/mine";
import { MINE_MATH, MINE_FEATURE_LINE, gameMath, volBucket } from "../src/lib/gameMath";
import { GAME_PATHS } from "../src/lib/lobby";
import { categoryOf } from "../src/lib/lobbyTabs";
import { BONUS_PLAYABLE } from "../src/lib/bonus";
import { POST as minePOST, GET as mineGET } from "../src/app/api/games/mine/route";

/** Seeded xorshift so Monte Carlo checks are reproducible. */
function seeded(seed: number): Pick {
  let s = seed >>> 0 || 1;
  return (n) => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return Math.floor((s / 4294967296) * n);
  };
}

describe("Canary Creek Mine strips", () => {
  it("30-stop strips; one DYNAMITE per reel; carts only on reels 1/3/5, never two in a window; wilds only on reels 2-4", () => {
    MINE_REELS.forEach((strip, r) => {
      expect(strip).toHaveLength(MINE_REEL_LEN);
      expect(strip.filter((s) => s === "DYNAMITE")).toHaveLength(1);
      const carts = strip.flatMap((s, i) => (s === "CART" ? [i] : []));
      expect(carts.length).toBe(r % 2 === 0 ? 2 : 0);
      if (carts.length === 2) expect(Math.min(carts[1]! - carts[0]!, MINE_REEL_LEN - (carts[1]! - carts[0]!))).toBeGreaterThanOrEqual(3);
      expect(strip.includes("WILD")).toBe(r >= 1 && r <= 3);
    });
  });
});

describe("line evaluation", () => {
  it("pays left to right with wild substitution; scatters and carts break lines", () => {
    expect(evaluateMineLine(["NUGGET", "WILD", "NUGGET", "ORE", "ORE"])).toEqual({ symbol: "NUGGET", count: 3, pay: 25 });
    expect(evaluateMineLine(["CANARY", "WILD", "WILD", "WILD", "CANARY"])).toEqual({ symbol: "CANARY", count: 5, pay: 250 });
    expect(evaluateMineLine(["PAN", "PAN", "DYNAMITE", "PAN", "PAN"])).toBeNull();
    expect(evaluateMineLine(["CART", "WILD", "WILD", "ORE", "ORE"])).toBeNull();
    expect(evaluateMineLine(["ORE", "ORE", "PAN", "ORE", "ORE"])).toBeNull();
  });
  it("dynamite pays anywhere x total bet and awards free spins; carts on 1/3/5 trigger the pick", () => {
    const g = mineWindow([0, 0, 0, 5, 5]);
    const r = evaluateMineGrid(g, 25);
    expect(r.scatters).toBe(3);
    expect(r.scatterWinCents).toBe(2 * 25 * 9);
    expect(r.freeSpinsAwarded).toBe(8);
    const c = evaluateMineGrid(mineWindow([10, 3, 10, 3, 10]), 25);
    expect(c.cart).toBe(true);
  });
});

describe("free spins", () => {
  it("retriggers add spins and the feature stops at the 100-spin cap", () => {
    // every stop 0 shows DYNAMITE on all 5 reels: each free spin retriggers +20 until the cap
    const fs = runFreeSpins(25, 20, () => 0);
    expect(fs.spins).toHaveLength(MINE_FS_CAP);
    expect(fs.capped).toBe(true);
    expect(fs.spins.at(-1)!.awardedTotal).toBe(MINE_FS_CAP);
    expect(fs.spins.every((s) => s.winCents % 2 === 0)).toBe(true);
    expect(fs.totalWinCents).toBe(fs.spins.reduce((a, s) => a + s.winCents, 0));
  });
  it("free-spin wins are doubled versus the same grid in the base game", () => {
    const stops = [6, 7, 8, 9, 13];
    let i = 0;
    const fs = runFreeSpins(100, 1, () => stops[i++ % 5]!);
    const base = evaluateMineGrid(mineWindow(stops), 100);
    expect(fs.spins[0]!.winCents).toBe(2 * (base.lineWinCents + base.scatterWinCents));
  });
  it("expected spins per feature (exact DP) matches simulation", () => {
    const pick = seeded(7);
    let n = 0, runs = 20000;
    for (let i = 0; i < runs; i++) n += runFreeSpins(25, 8, pick).spins.length;
    expect(n / runs).toBeCloseTo(expectedFreeSpins(8), 1);
  });
});

describe("Mine Cart pick", () => {
  it("first reveal is always a prize, reveals stop at the first COLLECT, total matches", () => {
    const pick = seeded(11);
    for (let i = 0; i < 5000; i++) {
      const p = drawPick(225, pick);
      expect(p.reveals[0]!.kind).toBe("prize");
      const firstCollect = p.reveals.findIndex((r) => r.kind === "collect");
      if (firstCollect >= 0) expect(firstCollect).toBe(p.reveals.length - 1);
      else expect(p.reveals).toHaveLength(MINE_PICK_PRIZES.length);
      expect(p.totalWinCents).toBe(p.totalX * 225);
      expect(p.totalX).toBeGreaterThanOrEqual(2);
    }
  });
  it("exact mean 15x and second moment agree with simulation", () => {
    expect(pickExpectedX()).toBe(15);
    const pick = seeded(3);
    let s = 0, s2 = 0; const N = 200000;
    for (let i = 0; i < N; i++) { const x = drawPick(1, pick).totalX; s += x; s2 += x * x; }
    expect(s / N).toBeCloseTo(15, 0);
    expect(s2 / N / pickSecondMoment()).toBeGreaterThan(0.99);
    expect(s2 / N / pickSecondMoment()).toBeLessThan(1.01);
    expect(MINE_PICK_COLLECTS).toBe(3);
  });
});

describe("exact RTP (published numbers locked)", () => {
  const ex = mineExact();
  it("closed form: base + free spins + pick = 95.42%", () => {
    expect(ex.totalRtp).toBeCloseTo(MINE_MATH.rtp, 6);
    expect(ex.lineRtp).toBeCloseTo(MINE_MATH.lineRtp, 6);
    expect(ex.scatterRtp).toBeCloseTo(MINE_MATH.scatterRtp, 6);
    expect(ex.baseRtp).toBeCloseTo(MINE_MATH.baseRtp, 6);
    expect(ex.freeSpinsRtp).toBeCloseTo(MINE_MATH.freeSpinsRtp, 6);
    expect(ex.pickRtp).toBeCloseTo(MINE_MATH.pickRtp, 6);
    expect(ex.freeSpinsChance).toBeCloseTo(MINE_MATH.freeSpinsChance, 8);
    expect(ex.pickChance).toBeCloseTo(cartProbExact(), 12);
    expect(scatterLaw().reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(ex.totalRtp).toBeGreaterThan(0.94);
    expect(ex.totalRtp).toBeLessThan(0.96);
  });
  it("30^5 enumeration agrees with the closed form; exact SD gives Medium volatility", () => {
    const en = mineEnumerate();
    expect(en.combos).toBe(30 ** 5);
    expect(en.baseRtp).toBeCloseTo(ex.baseRtp, 8);
    const full = mineExactFull(en);
    expect(full.totalRtpEnumerated).toBeCloseTo(ex.totalRtp, 8);
    expect(full.sdPerUnit).toBeCloseTo(MINE_MATH.sdPerUnit, 4);
    expect(full.hitRate).toBeCloseTo(MINE_MATH.hitRate, 6);
    expect(volBucket(full.sdPerUnit)).toBe("Medium");
  }, 60000);
  it("seeded Monte Carlo through playMine lands on the exact RTP", () => {
    const pick = seeded(2026);
    let W = 0, R = 0, fs = 0, pk = 0; const N = 300000;
    for (let i = 0; i < N; i++) {
      const s = playMine(25, pick);
      W += s.betCents; R += s.winCents; if (s.freeSpins) fs++; if (s.pick) pk++;
      expect(s.winCents).toBe(s.baseWinCents + (s.freeSpins?.totalWinCents ?? 0) + (s.pick?.totalWinCents ?? 0));
    }
    expect(Math.abs(R / W - MINE_MATH.rtp)).toBeLessThan(0.025); // ~4 SE at SD 3.1
    expect(fs / N).toBeCloseTo(MINE_MATH.freeSpinsChance, 3);
    expect(pk / N).toBeCloseTo(MINE_MATH.pickChance, 3);
  }, 60000);
  it("published strings come from the frozen math", () => {
    const m = gameMath("mine");
    expect(m.line).toBe("RTP 95.42% · Medium volatility · features included · wins about 1 in 5 spins");
    expect(m.href).toBe("/mine");
    expect(MINE_FEATURE_LINE).toBe("Free spins about 1 in 117 spins · Mine Cart pick about 1 in 125 spins");
    expect(gameMath("/mine").filterBuckets).toEqual(["Medium"]);
  });
  it("never pays a 5-of-a-kind of a symbol that isn't in the paytable", () => {
    expect(Object.keys(MINE_PAYTABLE).sort()).toEqual(["CANARY", "LANTERN", "NUGGET", "ORE", "PAN", "PICK"]);
  });
});

describe("lobby + rules wiring", () => {
  it("is a slot on the floor, not a bonus-money game", () => {
    expect(GAME_PATHS).toContain("/mine");
    expect(categoryOf("/mine")).toBe("slots");
    expect(BONUS_PLAYABLE.has("mine")).toBe(false);
    expect(readFileSync("src/app/rules/page.tsx", "utf8")).toMatch(/id="mine"/);
    expect(readFileSync("src/app/floor/page.tsx", "utf8")).toMatch(/href: "\/mine"/);
  });
  it("the client never decides an outcome (no Math.random in the game page)", () => {
    expect(readFileSync("src/app/mine/page.tsx", "utf8")).not.toMatch(/Math\.random/);
  });
});

describe("POST /api/games/mine (ledger)", () => {
  let cookie = "", uid = "";
  beforeEach(() => {
    resetDbForTests();
    const u = createUser({ email: "m@pit.test", password: "password123", displayName: "M", ageConfirmed: true });
    uid = u.id;
    cookie = `pit_session=${loginUser("m@pit.test", "password123").token}`;
  });
  it("requires sign-in; GET publishes the math", async () => {
    const r = await minePOST(new Request("http://x/api/games/mine", { method: "POST", body: JSON.stringify({ coinCents: 25 }) }));
    expect(r.status).toBe(401);
    const g = await (await (mineGET as unknown as () => Promise<Response>)()).json();
    expect(g.math.rtp).toBe(MINE_MATH.rtp);
  });
  it("debits coin x 9 and credits the whole result (features included) in one go", async () => {
    applyLedger({ userId: uid, type: "deposit", amountCents: 100000, idempotencyKey: "d" });
    let expected = 100000;
    for (let i = 0; i < 60; i++) {
      const res = await minePOST(new Request("http://x/api/games/mine", {
        method: "POST", headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ coinCents: 25, idempotencyKey: `k${i}` }),
      }));
      expect(res.status).toBe(200);
      const d = await res.json();
      expected += d.spin.winCents - 225;
      expect(d.balanceCents).toBe(expected);
    }
    expect(getBalance(uid)).toBe(expected);
    const rows = getDb().prepare("SELECT type, COUNT(*) n FROM ledger WHERE user_id = ? AND game = 'mine' GROUP BY type").all(uid) as { type: string; n: number }[];
    expect(rows.find((r) => r.type === "bet")!.n).toBe(60);
  });
  it("rejects a bad coin and an unfunded bet without moving money", async () => {
    const bad = await minePOST(new Request("http://x/api/games/mine", { method: "POST", headers: { cookie }, body: JSON.stringify({ coinCents: 7 }) }));
    expect(bad.status).toBeGreaterThanOrEqual(400);
    const broke = await minePOST(new Request("http://x/api/games/mine", { method: "POST", headers: { cookie }, body: JSON.stringify({ coinCents: 25 }) }));
    expect(broke.status).toBeGreaterThanOrEqual(400);
    expect(getBalance(uid)).toBe(0);
  });
});

void (null as unknown as MineSymbol);
