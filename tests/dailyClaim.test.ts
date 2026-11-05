import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import { resetDbForTests } from "../src/lib/db";
import { getBalance } from "../src/lib/ledger";
import { claimDaily, dailyStatus, chicagoDay, nextChicagoMidnight, DAILY_CLAIM_CENTS } from "../src/lib/dailyClaim";

function seed() {
  const db = resetDbForTests();
  db.prepare(`INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, created_at)
    VALUES ('u1','u1@pit.test','h','T',1,0,0,datetime('now'))`).run();
  return db;
}

describe("daily free sandbox chips", () => {
  let db: ReturnType<typeof seed>;
  beforeEach(() => { db = seed(); });

  it("pays once per Chicago day, refuses the second claim, balance from the ledger", () => {
    const t = new Date("2026-11-05T12:00:00Z"); // 6 AM CST
    const a = claimDaily(db, "u1", t);
    expect(a.ok).toBe(true);
    expect(getBalance("u1")).toBe(DAILY_CLAIM_CENTS);
    const b = claimDaily(db, "u1", new Date("2026-11-06T05:59:00Z")); // 11:59 PM CST same day
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.message).toMatch(/already claimed/i);
    expect(getBalance("u1")).toBe(DAILY_CLAIM_CENTS);
    const n = db.prepare("SELECT count(*) c FROM ledger WHERE user_id='u1'").get() as { c: number };
    expect(n.c).toBe(1);
  });

  it("opens again at Chicago midnight, not UTC midnight", () => {
    claimDaily(db, "u1", new Date("2026-11-05T12:00:00Z"));
    expect(claimDaily(db, "u1", new Date("2026-11-06T01:00:00Z")).ok).toBe(false); // UTC next day, still Nov 5 in Chicago
    expect(claimDaily(db, "u1", new Date("2026-11-06T06:00:00Z")).ok).toBe(true); // midnight CST
    expect(getBalance("u1")).toBe(2 * DAILY_CLAIM_CENTS);
  });

  it("reports next claim time and handles DST", () => {
    expect(chicagoDay(new Date("2026-11-05T12:00:00Z"))).toBe("2026-11-05");
    expect(nextChicagoMidnight(new Date("2026-11-05T12:00:00Z")).toISOString()).toBe("2026-11-06T06:00:00.000Z");
    expect(nextChicagoMidnight(new Date("2026-03-07T12:00:00Z")).toISOString()).toBe("2026-03-08T06:00:00.000Z");
    const s = dailyStatus(db, "u1", new Date("2026-11-05T12:00:00Z"));
    expect(s).toMatchObject({ claimedToday: false, amountCents: DAILY_CLAIM_CENTS });
  });

  it("respects the deposit limit the player set", () => {
    db.prepare("UPDATE users SET deposit_limit_cents = 1000 WHERE id='u1'").run();
    expect(() => claimDaily(db, "u1", new Date("2026-11-05T12:00:00Z"))).toThrow(/deposit/i);
    expect(getBalance("u1")).toBe(0);
  });

  it("is wired into the Cage and the API", () => {
    expect(fs.readFileSync("src/app/wallet/page.tsx", "utf8")).toMatch(/<DailyClaim/);
    expect(fs.readFileSync("src/app/api/wallet/daily/route.ts", "utf8")).toMatch(/withDbSync\(_POST\)/);
  });
});
