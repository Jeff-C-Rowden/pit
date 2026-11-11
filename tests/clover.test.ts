import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resetDbForTests, getDb } from "../src/lib/db";
import { createUser, loginUser } from "../src/lib/auth";
import { applyLedger, getBalance } from "../src/lib/ledger";
import {
  CL_REELS, CL_REEL_LEN, CL_PAYTABLE, CL_FS_CAP, CL_INNER_WHEEL, CL_OUTER_WHEEL, CL_BET_COINS,
  evaluateClLine, evaluateClGrid, expandWilds, clWindow, runClFreeSpins, spinWheel, playClover,
  lineRtpExact, clEnumerate, cloverExactFull, clWheelMoments, clFreeSpinMoments,
  type ClSymbol, type Pick,
} from "../src/lib/games/clover";
import { landingRotation, wedgeAtPointer } from "../src/lib/wheel";
import { CLOVER_MATH, CLOVER_FEATURE_LINE, gameMath, volBucket } from "../src/lib/gameMath";
import { GAME_PATHS } from "../src/lib/lobby";
import { categoryOf } from "../src/lib/lobbyTabs";
import { BONUS_PLAYABLE } from "../src/lib/bonus";
import { POST as clPOST, GET as clGET } from "../src/app/api/games/clover/route";

function seeded(seed: number): Pick {
  let s = seed >>> 0 || 1;
  return (n) => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return Math.floor((s / 4294967296) * n);
  };
}
const G = (cols: string[]) => cols.map((c) => c.split(" ") as ClSymbol[]);

describe("Kettle of Clover strips", () => {
  it("30-stop strips; one KETTLE per reel; two RAINBOWs only on reels 1/3/5, never in one window; wilds only on reels 2-4", () => {
    CL_REELS.forEach((strip, r) => {
      expect(strip).toHaveLength(CL_REEL_LEN);
      expect(strip.filter((s) => s === "KETTLE")).toHaveLength(1);
      const rb = strip.flatMap((s, i) => (s === "RAINBOW" ? [i] : []));
      expect(rb.length).toBe(r % 2 === 0 ? 2 : 0);
      if (rb.length === 2) expect(Math.min(rb[1]! - rb[0]!, CL_REEL_LEN - (rb[1]! - rb[0]!))).toBeGreaterThanOrEqual(3);
      expect(strip.includes("WILD")).toBe(r >= 1 && r <= 3);
    });
  });
});

describe("lines and expanding wilds", () => {
  it("pays left to right with wild substitution; kettles and rainbows break lines", () => {
    expect(evaluateClLine(["HAT", "WILD", "HAT", "ACORN", "ACORN"])).toEqual({ symbol: "HAT", count: 3, pay: CL_PAYTABLE.HAT[0] });
    expect(evaluateClLine(["HARP", "WILD", "WILD", "WILD", "HARP"])).toEqual({ symbol: "HARP", count: 5, pay: CL_PAYTABLE.HARP[2] });
    expect(evaluateClLine(["ACORN", "ACORN", "KETTLE", "ACORN", "ACORN"])).toBeNull();
    expect(evaluateClLine(["RAINBOW", "WILD", "WILD", "ACORN", "ACORN"])).toBeNull();
  });
  it("in free spins a wild anywhere on reels 2-4 fills its reel before lines are paid; kettles counted as landed", () => {
    const g = G(["FIDDLE FIDDLE FIDDLE", "ACORN WILD KETTLE", "FIDDLE ACORN ACORN", "HAT HAT HAT", "HAT HAT HAT"]);
    expect(expandWilds(g)[1]).toEqual(["WILD", "WILD", "WILD"]);
    expect(expandWilds(g)[0]).toEqual(g[0]);
    const base = evaluateClGrid(g, 1, false), free = evaluateClGrid(g, 1, true);
    expect(free.scatters).toBe(base.scatters);
    expect(free.lineWinCents).toBeGreaterThan(base.lineWinCents);
    expect(base.lineWins.map((w) => w.line)).toEqual([4]); // only line 5 (V-up) reaches FIDDLE-WILD-FIDDLE
    expect(free.lineWins.length).toBeGreaterThan(base.lineWins.length);
  });
  it("closed-form line RTP equals the 30^5 enumeration, base and free spins", () => {
    const base = clEnumerate(false), free = clEnumerate(true);
    expect(base.combos).toBe(30 ** 5);
    const scat = (e: typeof base) => e.bins.reduce((a, row, k) => a + row.reduce((b, bn) => b + bn.p, 0) * [0, 0, 0, 2, 5, 25][k]!, 0);
    expect(base.rtp - scat(base)).toBeCloseTo(lineRtpExact(false), 9);
    expect(free.rtp - scat(free)).toBeCloseTo(lineRtpExact(true), 9);
  }, 60000);
});

describe("free spins", () => {
  it("retriggers add spins and stop at the 100-spin cap", () => {
    const fs = runClFreeSpins(25, 15, "kettle", () => 0); // stop 0 = KETTLE on every reel
    expect(fs.spins).toHaveLength(CL_FS_CAP);
    expect(fs.capped).toBe(true);
  });
});

describe("Rainbow Wheel", () => {
  it("one uniform pick per wheel; UPGRADE goes to the outer wheel; credit paid x bet", () => {
    const counts = Array(12).fill(0);
    const pick = seeded(4);
    for (let i = 0; i < 120000; i++) {
      const w = spinWheel(25, pick);
      counts[w.inner]++;
      const innerW = CL_INNER_WHEEL[w.inner]!;
      if (innerW.kind === "upgrade") { expect(w.outer).not.toBeNull(); expect(w.result).toEqual(CL_OUTER_WHEEL[w.outer!]); }
      else { expect(w.outer).toBeNull(); expect(w.result).toEqual(innerW); }
      if (w.result.kind === "credit") expect(w.creditWinCents).toBe(w.result.x * 25 * CL_BET_COINS);
      if (w.result.kind === "fs") expect(w.freeSpins!.initial).toBe(w.result.spins);
      expect(w.totalWinCents).toBe(w.creditWinCents + (w.freeSpins?.totalWinCents ?? 0));
    }
    counts.forEach((c) => expect(c / 120000).toBeCloseTo(1 / 12, 2));
  });
  it("wheel animation lands exactly on the drawn wedge for every wedge", () => {
    for (let i = 0; i < 12; i++) for (const turns of [5, 6]) expect(wedgeAtPointer(landingRotation(i, turns))).toBe(i);
  });
  it("exact wheel mean matches simulation", () => {
    const fs = clEnumerate(true);
    const wm = clWheelMoments(fs);
    expect(wm.inner.m1).toBeCloseTo(CLOVER_MATH.wheelExpectedX, 4);
    const outerCredit = CL_OUTER_WHEEL.reduce((a, w) => a + (w.kind === "credit" ? w.x : clFreeSpinMoments((w as { spins: number }).spins, fs).m1) / 12, 0);
    expect(wm.outer.m1).toBeCloseTo(outerCredit, 9);
    const pick = seeded(8); let s = 0; const N = 200000;
    for (let i = 0; i < N; i++) s += spinWheel(1, pick).totalWinCents / CL_BET_COINS;
    expect(s / N).toBeGreaterThan(wm.inner.m1 * 0.97);
    expect(s / N).toBeLessThan(wm.inner.m1 * 1.03);
  }, 60000);
});

describe("exact RTP (published numbers locked)", () => {
  const ex = cloverExactFull();
  it("base + free spins + wheel = 95.35%, SD Medium", () => {
    expect(ex.totalRtp).toBeCloseTo(CLOVER_MATH.rtp, 6);
    expect(ex.baseRtp).toBeCloseTo(CLOVER_MATH.baseRtp, 6);
    expect(ex.lineRtp).toBeCloseTo(CLOVER_MATH.lineRtp, 6);
    expect(ex.scatterRtp).toBeCloseTo(CLOVER_MATH.scatterRtp, 9);
    expect(ex.freeSpinsRtp).toBeCloseTo(CLOVER_MATH.freeSpinsRtp, 6);
    expect(ex.wheelRtp).toBeCloseTo(CLOVER_MATH.wheelRtp, 6);
    expect(ex.freeSpinsChance).toBeCloseTo(CLOVER_MATH.freeSpinsChance, 9);
    expect(ex.wheelChance).toBeCloseTo(CLOVER_MATH.wheelChance, 9);
    expect(ex.sdPerUnit).toBeCloseTo(CLOVER_MATH.sdPerUnit, 4);
    expect(ex.hitRate).toBeCloseTo(CLOVER_MATH.hitRate, 5);
    expect(ex.freeSpinsPerFeature).toBeCloseTo(CLOVER_MATH.freeSpinsPerFeature, 5);
    expect(ex.freeSpinFeatureX).toBeCloseTo(CLOVER_MATH.freeSpinFeatureX, 4);
    expect(ex.totalRtp).toBeGreaterThan(0.94);
    expect(ex.totalRtp).toBeLessThan(0.96);
    expect(volBucket(ex.sdPerUnit)).toBe("Medium");
  }, 60000);
  it("seeded Monte Carlo through playClover lands on the exact RTP and feature rates", () => {
    const pick = seeded(2026);
    let W = 0, R = 0, fs = 0, wh = 0; const N = 300000;
    for (let i = 0; i < N; i++) {
      const s = playClover(25, pick);
      W += s.betCents; R += s.winCents; if (s.freeSpins) fs++; if (s.wheel) wh++;
      expect(s.winCents).toBe(s.baseWinCents + (s.freeSpins?.totalWinCents ?? 0) + (s.wheel?.totalWinCents ?? 0));
    }
    expect(Math.abs(R / W - CLOVER_MATH.rtp)).toBeLessThan(0.035); // ~4 SE at SD 4.2
    expect(fs / N).toBeCloseTo(CLOVER_MATH.freeSpinsChance, 3);
    expect(wh / N).toBeCloseTo(CLOVER_MATH.wheelChance, 3);
  }, 120000);
  it("published strings come from the frozen math", () => {
    const m = gameMath("clover");
    expect(m.line).toBe("RTP 95.35% · Medium volatility · features included · wins about 1 in 6 spins");
    expect(m.href).toBe("/clover");
    expect(CLOVER_FEATURE_LINE).toBe("Free spins about 1 in 117 spins · Rainbow Wheel about 1 in 125 spins");
    expect(gameMath("/clover").filterBuckets).toEqual(["Medium"]);
  });
});

describe("lobby + rules wiring", () => {
  it("is a story slot on the floor and in the hub, not a bonus-money game", () => {
    expect(GAME_PATHS).toContain("/clover");
    expect(categoryOf("/clover")).toBe("slots");
    expect(BONUS_PLAYABLE.has("clover")).toBe(false);
    expect(readFileSync("src/app/rules/page.tsx", "utf8")).toMatch(/id="clover"/);
    expect(readFileSync("src/app/floor/page.tsx", "utf8")).toMatch(/href: "\/clover"/);
    expect(readFileSync("src/app/stories/page.tsx", "utf8")).toMatch(/href: "\/clover"/);
    expect(readFileSync("src/app/activity/page.tsx", "utf8")).toMatch(/clover: "Kettle of Clover"/);
  });
  it("the client never decides an outcome and there is no force hook", () => {
    expect(readFileSync("src/app/clover/page.tsx", "utf8")).not.toMatch(/Math\.random/);
    expect(readFileSync("src/components/RainbowWheel.tsx", "utf8")).not.toMatch(/Math\.random/);
    const route = readFileSync("src/app/api/games/clover/route.ts", "utf8");
    expect(route.replace("force-dynamic", "")).not.toMatch(/force|stops|seed|NODE_ENV|body\.(grid|pick|wheel|wedge)/i);
    expect(route).toMatch(/playClover\(Number\(body\.coinCents\)\)/);
  });
});

describe("POST /api/games/clover (ledger)", () => {
  let cookie = "", uid = "";
  beforeEach(() => {
    resetDbForTests();
    const u = createUser({ email: "c@pit.test", password: "password123", displayName: "C", ageConfirmed: true });
    uid = u.id;
    cookie = `pit_session=${loginUser("c@pit.test", "password123").token}`;
  });
  it("requires sign-in; GET publishes the math", async () => {
    const r = await clPOST(new Request("http://x/api/games/clover", { method: "POST", body: JSON.stringify({ coinCents: 25 }) }));
    expect(r.status).toBe(401);
    const g = await (await (clGET as unknown as () => Promise<Response>)()).json();
    expect(g.math.rtp).toBe(CLOVER_MATH.rtp);
  });
  it("debits coin x 10 and credits the whole result (wheel and free spins included) in one transaction", async () => {
    applyLedger({ userId: uid, type: "deposit", amountCents: 100000, idempotencyKey: "d" });
    let expected = 100000;
    for (let i = 0; i < 60; i++) {
      const res = await clPOST(new Request("http://x/api/games/clover", {
        method: "POST", headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ coinCents: 25, idempotencyKey: `k${i}` }),
      }));
      expect(res.status).toBe(200);
      const d = await res.json();
      expected += d.spin.winCents - 250;
      expect(d.balanceCents).toBe(expected);
    }
    expect(getBalance(uid)).toBe(expected);
    const rows = getDb().prepare("SELECT type, COUNT(*) n FROM ledger WHERE user_id = ? AND game = 'clover' GROUP BY type").all(uid) as { type: string; n: number }[];
    expect(rows.find((r) => r.type === "bet")!.n).toBe(60);
  });
  it("rejects a bad coin and an unfunded bet without moving money", async () => {
    const bad = await clPOST(new Request("http://x/api/games/clover", { method: "POST", headers: { cookie }, body: JSON.stringify({ coinCents: 7 }) }));
    expect(bad.status).toBeGreaterThanOrEqual(400);
    const broke = await clPOST(new Request("http://x/api/games/clover", { method: "POST", headers: { cookie }, body: JSON.stringify({ coinCents: 25 }) }));
    expect(broke.status).toBeGreaterThanOrEqual(400);
    expect(getBalance(uid)).toBe(0);
  });
});

void clWindow;
