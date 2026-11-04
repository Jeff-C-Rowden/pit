import { describe, it, expect, beforeEach } from "vitest";
import { resetDbForTests, getDb } from "../src/lib/db";
import { createUser, loginUser } from "../src/lib/auth";
import { applyLedger, getBalance } from "../src/lib/ledger";
import { settleRoulette, oddsTable, publicWheel, recordSpin, recentSpins, dozen, column, WHEEL, RED } from "../src/lib/games/roulette";
import { coveredBy, WHEEL_ORDER } from "../src/lib/games/rouletteFelt";
import { GET as historyGET } from "../src/app/api/games/roulette/history/route";
import { POST as spinPOST } from "../src/app/api/games/roulette/route";

describe("roulette payouts (stake included)", () => {
  const cases: [string, string[], number][] = [
    ["split", ["17", "20"], 1800], ["street", ["1", "2", "3"], 1200], ["corner", ["1", "2", "4", "5"], 900],
    ["five", ["0", "00", "1", "2", "3"], 700], ["six", ["1", "2", "3", "4", "5", "6"], 600],
  ];
  for (const [kind, nums, pay] of cases) {
    it(`${kind} pays ${pay / 100 - 1}:1`, () => {
      const r = settleRoulette([{ kind: kind as never, numbers: nums, amountCents: 100 }], nums[0]!);
      expect(r.payoutCents).toBe(pay);
      expect(settleRoulette([{ kind: kind as never, numbers: nums, amountCents: 100 }], "36").payoutCents).toBe(0);
    });
  }
  it("column pays 2:1 and red pays 1:1", () => {
    expect(settleRoulette([{ kind: "column", numbers: column(1), amountCents: 100 }], "34").payoutCents).toBe(300);
    expect(settleRoulette([{ kind: "red", numbers: [...RED], amountCents: 100 }], "1").payoutCents).toBe(200);
  });
  it("every non-five bet has 5.26% edge; five-number 7.89%", () => {
    for (const o of oddsTable()) expect(o.houseEdgePct).toBe(o.kind === "five" ? 7.89 : 5.26);
    expect(publicWheel().houseEdge).toContain("7.89%");
  });
  it("client coverage matches server dozens/columns and wheel order matches", () => {
    expect(coveredBy({ kind: "dozen", which: 2 })).toEqual(dozen(2));
    expect(coveredBy({ kind: "column", which: 3 })).toEqual(column(3));
    expect([...WHEEL_ORDER]).toEqual(WHEEL);
  });
});

describe("roulette history", () => {
  let cookie = "";
  let uid = "";
  beforeEach(() => {
    resetDbForTests();
    const u = createUser({ email: "h@pit.test", password: "password123", displayName: "H", ageConfirmed: true });
    uid = u.id;
    cookie = `pit_session=${loginUser("h@pit.test", "password123").token}`;
  });
  it("recentSpins returns newest first, capped", () => {
    for (let i = 0; i < 25; i++) recordSpin(getDb(), { id: `s${i}`, userId: uid, pocket: WHEEL[i % 38]!, stakeCents: 100, payoutCents: 0 });
    const h = recentSpins(getDb(), uid);
    expect(h).toHaveLength(20);
    expect(h[0]).toBe(WHEEL[24]);
  });
  it("history endpoint requires sign-in and reflects real settled spins", async () => {
    expect((await historyGET(new Request("http://x/api/games/roulette/history"))).status).toBe(401);
    applyLedger({ userId: uid, type: "deposit", amountCents: 10000, idempotencyKey: "d" });
    const pockets: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await spinPOST(new Request("http://x/api/games/roulette", {
        method: "POST", headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ bets: [{ kind: "red", numbers: [], amountCents: 100 }] }),
      }));
      const d = await res.json();
      expect(res.status).toBe(200);
      pockets.unshift(d.spin.pocket);
      expect(d.history[0]).toBe(d.spin.pocket);
    }
    const h = await (await historyGET(new Request("http://x/api/games/roulette/history", { headers: { cookie } }))).json();
    expect(h.pockets).toEqual(pockets);
    expect(getBalance(uid)).toBeLessThanOrEqual(10000 + 300);
  });
});
