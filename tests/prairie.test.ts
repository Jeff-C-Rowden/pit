import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resetDbForTests, getDb } from "../src/lib/db";
import { createUser, loginUser } from "../src/lib/auth";
import { applyLedger, getBalance } from "../src/lib/ledger";
import {
  PR_REELS, PR_FS_REELS, PR_REEL_LEN, PR_PAYTABLE, PR_FS_CAP, PR_COIN_VALUES, PR_COIN_WEIGHT, PR_CELLS, PR_HS_RESPINS,
  evaluateWays, prWindow, runPrFreeSpins, runHoldSpin, playPrairie, drawCoinValue, waysRtpExact, prEnumerate, prairieExactFull,
  holdFinalLaw, holdMoments, coinMean, prScatterLaw, prCoinLaw,
  type PrSymbol, type Pick,
} from "../src/lib/games/prairie";
import { PRAIRIE_MATH, PRAIRIE_FEATURE_LINE, gameMath, volBucket } from "../src/lib/gameMath";
import { GAME_PATHS } from "../src/lib/lobby";
import { categoryOf } from "../src/lib/lobbyTabs";
import { BONUS_PLAYABLE } from "../src/lib/bonus";
import { POST as prPOST, GET as prGET } from "../src/app/api/games/prairie/route";

function seeded(seed: number): Pick {
  let s = seed >>> 0 || 1;
  return (n) => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return Math.floor((s / 4294967296) * n);
  };
}
const G = (cols: string[]) => cols.map((c) => c.split(" ") as PrSymbol[]);

describe("Thunderhoof Prairie strips", () => {
  it("30-stop strips; one STORM per reel; 4 coins per reel; wilds only on reels 2-4; free-spin strips only re-print wilds", () => {
    PR_REELS.forEach((strip, r) => {
      expect(strip).toHaveLength(PR_REEL_LEN);
      expect(strip.filter((s) => s === "STORM")).toHaveLength(1);
      expect(strip.filter((s) => s === "COIN")).toHaveLength(4);
      expect(strip.includes("WILD")).toBe(r >= 1 && r <= 3);
      expect(PR_FS_REELS[r]!.map((s) => (s === "W2" || s === "W3" ? "WILD" : s))).toEqual(strip);
      if (r >= 1 && r <= 3) expect(new Set(PR_FS_REELS[r]!.filter((s) => s[0] === "W"))).toEqual(new Set(["W2", "W3"]));
    });
  });
});

describe("243-ways evaluation", () => {
  it("multiplies matching cells per reel, wilds substitute on reels 2-4 only, longest run pays", () => {
    // 2 buffalo x (1 buffalo + 1 wild) x 1 buffalo, reel 4 has none: 3-reel pay x 4 ways
    const g = G(["BUFFALO BUFFALO J", "BUFFALO WILD Q", "K BUFFALO A", "J Q K", "A A A"]);
    const r = evaluateWays(g, 10);
    const buf = r.wins.find((w) => w.symbol === "BUFFALO")!;
    expect(buf).toMatchObject({ reels: 3, ways: 4, pay: PR_PAYTABLE.BUFFALO[0] * 4 });
    // the wild on reel 2 also completes J? reel1 J, reel2 wild, reel3 none -> no
    expect(r.wins.find((w) => w.symbol === "J")).toBeUndefined();
    expect(r.winCents).toBe(r.wins.reduce((a, w) => a + w.winCents, 0));
    // wild on reel 1 does not count
    expect(evaluateWays(G(["WILD Q K", "EAGLE J J", "EAGLE J J", "A A A", "A A A"]), 1).wins.find((w) => w.symbol === "EAGLE")).toBeUndefined();
  });
  it("free-spin wilds multiply: 2x and 3x on one way = 6x", () => {
    const g = G(["EAGLE J J", "W2 Q Q", "W3 K K", "EAGLE A A", "Q Q Q"]);
    const w = evaluateWays(g, 1).wins.find((x) => x.symbol === "EAGLE")!;
    expect(w).toMatchObject({ reels: 4, ways: 1, mult: 6, pay: PR_PAYTABLE.EAGLE[1] * 6 });
  });
  it("closed-form ways RTP equals the full 30^5 enumeration", () => {
    const en = prEnumerate();
    expect(en.combos).toBe(30 ** 5);
    const scatter = prScatterLaw().reduce((a, p, k) => a + p * [0, 0, 0, 2, 5, 20][k]!, 0);
    expect(en.baseRtp - scatter).toBeCloseTo(waysRtpExact(PR_REELS), 9);
  }, 60000);
});

describe("free spins", () => {
  it("retriggers add spins and stop at the 100-spin cap", () => {
    const fs = runPrFreeSpins(25, 20, () => 0); // stop 0 = STORM on every reel
    expect(fs.spins).toHaveLength(PR_FS_CAP);
    expect(fs.capped).toBe(true);
    expect(fs.spins.at(-1)!.awardedTotal).toBe(PR_FS_CAP);
  });
});

describe("Hold & Spin", () => {
  it("coins lock, respins reset to 3 on any new coin, ends at 0 or full screen, pays the sum", () => {
    const pick = seeded(5);
    for (let i = 0; i < 4000; i++) {
      const start = [0, 1, 2, 3, 4, 5].map((cell) => ({ cell, x: drawCoinValue(pick) }));
      const h = runHoldSpin(250, start, pick);
      let left = PR_HS_RESPINS;
      for (const r of h.respins) { left = r.landed.length ? PR_HS_RESPINS : left - 1; expect(r.respinsLeft).toBe(left); }
      expect(left === 0 || h.full).toBe(true);
      const n = h.board.filter((v) => v !== null).length;
      expect(n).toBe(6 + h.respins.reduce((a, r) => a + r.landed.length, 0));
      expect(h.totalX).toBeCloseTo(h.board.reduce<number>((a, v) => a + (v ?? 0), 0), 9);
      expect(h.totalWinCents).toBe(Math.round(h.totalX * 250));
      start.forEach((c) => expect(h.board[c.cell]).toBe(c.x));
    }
  });
  it("coin table sums to 1000; only fixed MINI/MINOR/MAJOR labels, no progressive", () => {
    expect(PR_COIN_VALUES.reduce((a, v) => a + v.w, 0)).toBe(PR_COIN_WEIGHT);
    expect(PR_COIN_VALUES.filter((v) => v.label).map((v) => [v.label, v.x])).toEqual([["MINI", 10], ["MINOR", 25], ["MAJOR", 100]]);
    expect(coinMean()).toBeCloseTo(2.065, 9);
  });
  it("exact final-count law (Markov chain) matches simulation", () => {
    const law = holdFinalLaw(6);
    expect(law.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    const pick = seeded(9);
    const N = 100000; let sumN = 0;
    for (let i = 0; i < N; i++) sumN += runHoldSpin(1, [0, 1, 2, 3, 4, 5].map((cell) => ({ cell, x: 1 })), pick).board.filter((v) => v !== null).length;
    expect(sumN / N).toBeCloseTo(holdMoments(6).eN, 1);
    expect(law.length).toBe(PR_CELLS + 1);
  });
});

describe("exact RTP (published numbers locked)", () => {
  const ex = prairieExactFull();
  it("base + free spins + Hold & Spin = 95.25%, SD Medium", () => {
    expect(ex.totalRtp).toBeCloseTo(PRAIRIE_MATH.rtp, 6);
    expect(ex.baseRtp).toBeCloseTo(PRAIRIE_MATH.baseRtp, 6);
    expect(ex.waysRtp).toBeCloseTo(PRAIRIE_MATH.waysRtp, 6);
    expect(ex.scatterRtp).toBeCloseTo(PRAIRIE_MATH.scatterRtp, 9);
    expect(ex.freeSpinsRtp).toBeCloseTo(PRAIRIE_MATH.freeSpinsRtp, 6);
    expect(ex.holdRtp).toBeCloseTo(PRAIRIE_MATH.holdRtp, 6);
    expect(ex.freeSpinsChance).toBeCloseTo(PRAIRIE_MATH.freeSpinsChance, 9);
    expect(ex.holdChance).toBeCloseTo(PRAIRIE_MATH.holdChance, 6);
    expect(ex.holdChance).toBeCloseTo(prCoinLaw().slice(6).reduce((a, b) => a + b, 0), 12);
    expect(ex.sdPerUnit).toBeCloseTo(PRAIRIE_MATH.sdPerUnit, 4);
    expect(ex.hitRate).toBeCloseTo(PRAIRIE_MATH.hitRate, 5);
    expect(ex.freeSpinsPerFeature).toBeCloseTo(PRAIRIE_MATH.freeSpinsPerFeature, 5);
    expect(ex.freeSpinFeatureX).toBeCloseTo(PRAIRIE_MATH.freeSpinFeatureX, 4);
    expect(ex.holdFeatureX).toBeCloseTo(PRAIRIE_MATH.holdFeatureX, 4);
    expect(ex.totalRtp).toBeGreaterThan(0.94);
    expect(ex.totalRtp).toBeLessThan(0.96);
    expect(volBucket(ex.sdPerUnit)).toBe("Medium");
  }, 60000);
  it("seeded Monte Carlo through playPrairie lands on the exact RTP and feature rates", () => {
    const pick = seeded(2026);
    let W = 0, R = 0, fs = 0, hs = 0; const N = 300000;
    for (let i = 0; i < N; i++) {
      const s = playPrairie(25, pick);
      W += s.betCents; R += s.winCents; if (s.freeSpins) fs++; if (s.hold) hs++;
      expect(s.winCents).toBe(s.baseWinCents + (s.freeSpins?.totalWinCents ?? 0) + (s.hold?.totalWinCents ?? 0));
      if (s.hold) expect(s.coins.flat().filter((x) => x !== null).length).toBeGreaterThanOrEqual(6);
    }
    expect(Math.abs(R / W - PRAIRIE_MATH.rtp)).toBeLessThan(0.05); // ~4 SE at SD 6.8
    expect(fs / N).toBeCloseTo(PRAIRIE_MATH.freeSpinsChance, 3);
    expect(hs / N).toBeCloseTo(PRAIRIE_MATH.holdChance, 3);
  }, 120000);
  it("published strings come from the frozen math", () => {
    const m = gameMath("prairie");
    expect(m.line).toBe("RTP 95.25% · Medium volatility · features included · wins about 1 in 8 spins");
    expect(m.href).toBe("/prairie");
    expect(PRAIRIE_FEATURE_LINE).toBe("Free spins about 1 in 117 spins · Hold & Spin about 1 in 87 spins");
    expect(gameMath("/prairie").filterBuckets).toEqual(["Medium"]);
  });
});

describe("lobby + rules wiring", () => {
  it("is a story slot on the floor, not a bonus-money game, with a Story Slots hub", () => {
    expect(GAME_PATHS).toContain("/prairie");
    expect(categoryOf("/prairie")).toBe("slots");
    expect(BONUS_PLAYABLE.has("prairie")).toBe(false);
    expect(readFileSync("src/app/rules/page.tsx", "utf8")).toMatch(/id="prairie"/);
    expect(readFileSync("src/app/floor/page.tsx", "utf8")).toMatch(/href: "\/prairie"/);
    expect(readFileSync("src/components/Shell.tsx", "utf8")).toMatch(/"\/stories", "Story Slots"/);
    const hub = readFileSync("src/app/stories/page.tsx", "utf8");
    expect(hub).toMatch(/href: "\/prairie"/); expect(hub).toMatch(/href: "\/mine"/);
    expect(readFileSync("src/app/activity/page.tsx", "utf8")).toMatch(/prairie: "Thunderhoof Prairie"/);
  });
  it("the client never decides an outcome and there is no force hook", () => {
    expect(readFileSync("src/app/prairie/page.tsx", "utf8")).not.toMatch(/Math\.random/);
    const route = readFileSync("src/app/api/games/prairie/route.ts", "utf8");
    expect(route.replace("force-dynamic", "")).not.toMatch(/force|stops|seed|NODE_ENV|body\.(grid|pick)/i);
    expect(route).toMatch(/playPrairie\(Number\(body\.coinCents\)\)/);
  });
});

describe("POST /api/games/prairie (ledger)", () => {
  let cookie = "", uid = "";
  beforeEach(() => {
    resetDbForTests();
    const u = createUser({ email: "p@pit.test", password: "password123", displayName: "P", ageConfirmed: true });
    uid = u.id;
    cookie = `pit_session=${loginUser("p@pit.test", "password123").token}`;
  });
  it("requires sign-in; GET publishes the math", async () => {
    const r = await prPOST(new Request("http://x/api/games/prairie", { method: "POST", body: JSON.stringify({ coinCents: 25 }) }));
    expect(r.status).toBe(401);
    const g = await (await (prGET as unknown as () => Promise<Response>)()).json();
    expect(g.math.rtp).toBe(PRAIRIE_MATH.rtp);
  });
  it("debits coin x 10 and credits the whole result (features included) in one transaction", async () => {
    applyLedger({ userId: uid, type: "deposit", amountCents: 100000, idempotencyKey: "d" });
    let expected = 100000;
    for (let i = 0; i < 60; i++) {
      const res = await prPOST(new Request("http://x/api/games/prairie", {
        method: "POST", headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ coinCents: 25, idempotencyKey: `k${i}` }),
      }));
      expect(res.status).toBe(200);
      const d = await res.json();
      expected += d.spin.winCents - 250;
      expect(d.balanceCents).toBe(expected);
    }
    expect(getBalance(uid)).toBe(expected);
    const rows = getDb().prepare("SELECT type, COUNT(*) n FROM ledger WHERE user_id = ? AND game = 'prairie' GROUP BY type").all(uid) as { type: string; n: number }[];
    expect(rows.find((r) => r.type === "bet")!.n).toBe(60);
  });
  it("rejects a bad coin and an unfunded bet without moving money", async () => {
    const bad = await prPOST(new Request("http://x/api/games/prairie", { method: "POST", headers: { cookie }, body: JSON.stringify({ coinCents: 7 }) }));
    expect(bad.status).toBeGreaterThanOrEqual(400);
    const broke = await prPOST(new Request("http://x/api/games/prairie", { method: "POST", headers: { cookie }, body: JSON.stringify({ coinCents: 25 }) }));
    expect(broke.status).toBeGreaterThanOrEqual(400);
    expect(getBalance(uid)).toBe(0);
  });
});
