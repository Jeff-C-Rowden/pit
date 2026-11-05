import { describe, it, expect } from "vitest";
import { resetDbForTests } from "../src/lib/db";
import { debitBet, creditPayout } from "../src/lib/ledger";
import { historyActivity, historyRange, chicagoDayStart, activityCsv, selfExclude } from "../src/lib/session";
import { startBlackjackWithCards, stand, startBlackjack, abandonHand } from "../src/lib/games/blackjack";
import { startPaiGow, setHouseWayPlayer } from "../src/lib/games/paigow";
import { settleRoulette } from "../src/lib/games/roulette";
import { pausedLabel, exclusionNote } from "../src/lib/pauseText";

function mk() {
  const db = resetDbForTests();
  db.prepare(`INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, created_at)
    VALUES ('u1','u1@pit.test','h','T',1,0,100000,datetime('now'))`).run();
  return db;
}
const C = (r: string, s = "S") => ({ rank: r, suit: s }) as any;

describe("stake-back split for blackjack, roulette and Pai Gow", () => {
  it("roulette: back is the sum of winning bets' stakes", () => {
    const r = settleRoulette([{ kind: "red", numbers: ["1"], amountCents: 500 } as any, { kind: "straight", numbers: ["2"], amountCents: 100 } as any], "1");
    expect(r.stakeBackCents).toBe(500);
    expect(r.payoutCents - r.stakeBackCents).toBeGreaterThan(0);
  });
  it("roulette: losing spin has no back", () => {
    expect(settleRoulette([{ kind: "red", numbers: ["1"], amountCents: 500 } as any], "2").stakeBackCents).toBe(0);
  });
  it("blackjack: back never exceeds payout and equals stake on a win or push", () => {
    for (let i = 0; i < 400; i++) {
      let s = startBlackjack(1000);
      if (s.phase === "insurance") continue;
      if (s.phase !== "settled") s = stand(s);
      expect(s.phase).toBe("settled");
      const back = s.stakeBackCents!;
      expect(back).toBeGreaterThanOrEqual(0); expect(back).toBeLessThanOrEqual(s.payoutCents!);
      if (s.payoutCents! > 0) expect(back).toBe(1000); else expect(back).toBe(0);
    }
  });
  it("blackjack: abandoned hand pays and returns nothing", () => {
    const s = startBlackjack(1000);
    if (s.phase !== "settled") expect(abandonHand(s).stakeBackCents).toBe(0);
  });
  it("pai gow: back is the bet whenever anything is paid", () => {
    for (let i = 0; i < 200; i++) {
      const s = setHouseWayPlayer(startPaiGow(1000));
      expect(s.phase).toBe("settled");
      expect(s.stakeBackCents).toBe(s.payoutCents! > 0 ? 1000 : 0);
    }
  });
});

describe("full-history CSV", () => {
  it("Chicago midnight handles CST and CDT", () => {
    expect(chicagoDayStart("2026-01-15").toISOString()).toBe("2026-01-15T06:00:00.000Z");
    expect(chicagoDayStart("2026-07-15").toISOString()).toBe("2026-07-15T05:00:00.000Z");
  });
  it("validates ranges", () => {
    expect("error" in historyRange(null, "2026-01-01")).toBe(true);
    expect("error" in historyRange("2026-02-30", "2026-03-01")).toBe(true);
    expect("error" in historyRange("2026-03-02", "2026-03-01")).toBe(true);
    expect("error" in historyRange("2024-01-01", "2026-01-01")).toBe(true);
    expect("error" in historyRange("'; drop", "2026-01-01")).toBe(true);
    const ok = historyRange("2026-11-01", "2026-11-05");
    expect("error" in ok).toBe(false);
  });
  it("includes every ledger row in the range, with splits, across sessions", () => {
    const db = mk();
    debitBet("u1", 500, "roulette", "a", "k1", undefined, db);
    creditPayout("u1", 1000, "roulette", "a", "k2", { stakeBackCents: 500, wonCents: 500 }, db);
    const r = historyRange("2000-01-01", "2000-01-02");
    expect("error" in r ? r : historyActivity(db, "u1", r.start, r.end)).toEqual([]);
    const now = new Date(); const start = new Date(now.getTime() - 86_400_000); const end = new Date(now.getTime() + 86_400_000);
    const rows = historyActivity(db, "u1", start, end);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.find((x) => x.type === "payout")!.stakeBackCents).toBe(500);
    expect(activityCsv(rows)).toContain('"payout","10.00","5.00","5.00"');
    expect(historyActivity(db, "nobody", start, end)).toEqual([]);
  });
});

describe("paused labels and floor note", () => {
  it("button label uses the server end time", () => {
    const soon = new Date(Date.now() + 3_600_000).toISOString(); expect(pausedLabel({ breakUntil: soon, breakKind: "break" })).toMatch(/^Paused until \d{1,2}:\d{2} [AP]M$/);
    expect(pausedLabel({ breakUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(), breakKind: "exclusion" })).toMatch(/^Paused until [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M$/);
    expect(pausedLabel({ blocked: { breakEndsAt: soon } })).toMatch(/^Paused until /);
    expect(pausedLabel({})).toBeNull();
  });
  it("floor note only for exclusion", () => {
    expect(exclusionNote({ breakUntil: "2026-11-05T06:58:00Z", breakKind: "break" })).toBeNull();
    expect(exclusionNote({ breakUntil: "2026-11-05T06:58:00Z", breakKind: "exclusion" })).toContain("12:58 AM");
  });
});
