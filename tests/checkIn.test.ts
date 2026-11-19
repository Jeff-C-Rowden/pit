import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resetDbForTests, getDb } from "../src/lib/db";
import { createUser, loginUser } from "../src/lib/auth";
import { applyLedger } from "../src/lib/ledger";
import { requestSetting, budgetView, currentSession, migrateSession, BUDGET_CHOICES, takeBreak } from "../src/lib/session";
import { COOL_OFF_MS } from "../src/lib/limits";
import {
  ackFor, budgetBlock, checkInDue, fmtNet, fmtPlayed, parseAck, timeBlock, CHECKIN_COPY,
} from "../src/lib/checkIn";
import { GET as sessionGET, POST as sessionPOST } from "../src/app/api/session/route";
import { GET as activityGET } from "../src/app/api/session/activity/route";
import { POST as slotPOST } from "../src/app/api/games/slot/route";

type Route = (req: Request) => Promise<Response>;
const src = (p: string) => readFileSync(p, "utf8");
const base = { active: true, minutes: 0, netCents: 0, everyMin: null as number | null, budgetCents: null as number | null, ack: { t: 0, b: 0 } };

describe("check-in triggers (pure)", () => {
  it("is off by default: no time interval and no budget → never due", () => {
    expect(checkInDue({ ...base, minutes: 600, netCents: -999999 })).toBeNull();
  });
  it("never shows outside an active session", () => {
    expect(checkInDue({ ...base, active: false, minutes: 90, netCents: -5000, everyMin: 15, budgetCents: 1000 })).toBeNull();
  });
  it("time: due once per full interval reached", () => {
    expect(timeBlock(14, 15)).toBe(0);
    expect(timeBlock(15, 15)).toBe(1);
    expect(timeBlock(47, 15)).toBe(3);
    expect(timeBlock(47, null)).toBe(0);
    expect(checkInDue({ ...base, minutes: 14, everyMin: 15 })).toBeNull();
    expect(checkInDue({ ...base, minutes: 15, everyMin: 15 })).toMatchObject({ time: true, budget: false, t: 1 });
  });
  it("budget: only a net LOSS counts, once per whole budget reached", () => {
    expect(budgetBlock(5000, 1000)).toBe(0);
    expect(budgetBlock(0, 1000)).toBe(0);
    expect(budgetBlock(-999, 1000)).toBe(0);
    expect(budgetBlock(-1000, 1000)).toBe(1);
    expect(budgetBlock(-2740, 1000)).toBe(2);
    expect(budgetBlock(-2740, null)).toBe(0);
    expect(checkInDue({ ...base, netCents: -2500, budgetCents: 2500 })).toMatchObject({ time: false, budget: true, b: 1 });
    expect(checkInDue({ ...base, netCents: 9000, budgetCents: 2500, minutes: 200 })).toBeNull();
  });
  it("Keep playing waits for the next interval or budget step, never re-nags the same one", () => {
    const d1 = checkInDue({ ...base, minutes: 31, netCents: -2600, everyMin: 30, budgetCents: 2500 })!;
    expect(d1).toMatchObject({ time: true, budget: true });
    const a = ackFor(d1, { t: 0, b: 0 });
    expect(a).toEqual({ t: 1, b: 1 });
    expect(checkInDue({ ...base, minutes: 59, netCents: -4999, everyMin: 30, budgetCents: 2500, ack: a })).toBeNull();
    // winning back some chips never re-opens it
    expect(checkInDue({ ...base, minutes: 40, netCents: -100, everyMin: 30, budgetCents: 2500, ack: a })).toBeNull();
    expect(checkInDue({ ...base, minutes: 60, netCents: -100, everyMin: 30, budgetCents: 2500, ack: a })).toMatchObject({ time: true, budget: false });
    expect(checkInDue({ ...base, minutes: 40, netCents: -5000, everyMin: 30, budgetCents: 2500, ack: a })).toMatchObject({ time: false, budget: true });
    expect(ackFor({ time: false, budget: true, t: 0, b: 2 }, { t: 3, b: 1 })).toEqual({ t: 3, b: 2 });
  });
  it("reads the stored acknowledgement, including the old reality-check number", () => {
    expect(parseAck(JSON.stringify({ t: 2, b: 1 }), null)).toEqual({ t: 2, b: 1 });
    expect(parseAck(null, "3")).toEqual({ t: 3, b: 0 });
    expect(parseAck("{bad", null)).toEqual({ t: 0, b: 0 });
    expect(parseAck(JSON.stringify({ t: "x" }), "junk")).toEqual({ t: 0, b: 0 });
  });
  it("formats figures exactly as the ledger has them", () => {
    expect(fmtNet(-2740)).toBe("−$27.40");
    expect(fmtNet(125)).toBe("+$1.25");
    expect(fmtNet(0)).toBe("$0.00");
    expect(fmtNet(-123456)).toBe("−$1,234.56");
    expect(fmtPlayed(42)).toBe("42 min");
    expect(fmtPlayed(75)).toBe("1 hr 15 min");
  });
});

describe("budget check-in setting (server, same cooling-off as the time settings)", () => {
  const T = new Date("2026-11-18T18:00:00Z");
  beforeEach(() => {
    const db = resetDbForTests();
    db.prepare(`INSERT INTO users (id, email, password_hash, display_name, age_confirmed, is_operator, balance_cents, created_at)
      VALUES ('u1','u1@pit.test','h','T',1,0,100000,datetime('now'))`).run();
  });
  it("starts off; adding or lowering applies now; raising or turning off waits 24h", () => {
    const db = getDb();
    expect(budgetView(db, "u1", T)).toEqual({ cents: null, pending: null });
    expect(requestSetting(db, "u1", "budget", 5000, T).applied).toBe("now");
    expect(requestSetting(db, "u1", "budget", 2500, T).applied).toBe("now");
    expect(requestSetting(db, "u1", "budget", 10000, T).applied).toBe("pending");
    expect(budgetView(db, "u1", T).cents).toBe(2500);
    const off = requestSetting(db, "u1", "budget", null, T);
    expect(off.applied).toBe("pending");
    expect(budgetView(db, "u1", T)).toEqual({ cents: 2500, pending: { cents: null, effectiveAt: new Date(T.getTime() + COOL_OFF_MS).toISOString() } });
    expect(budgetView(db, "u1", new Date(T.getTime() + COOL_OFF_MS)).cents).toBeNull();
  });
  it("accepts only the listed amounts", () => {
    expect(BUDGET_CHOICES).toEqual([1000, 2500, 5000, 10000, 25000]);
    expect(() => requestSetting(getDb(), "u1", "budget", 1234, T)).toThrow(/\$10, \$25/);
  });
  it("migration is idempotent and adds the budget columns", () => {
    const db = getDb();
    expect(() => { migrateSession(db); migrateSession(db); }).not.toThrow();
    const cols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(["budget_check_cents", "budget_pending_cents", "budget_pending_at"]));
  });
});

describe("/api/session + real spins: figures from the ledger, Take a break really pauses", () => {
  let cookie = "", uid = "";
  beforeEach(() => {
    resetDbForTests();
    uid = createUser({ email: "c@pit.test", password: "password123", displayName: "C", ageConfirmed: true }).id;
    cookie = `pit_session=${loginUser("c@pit.test", "password123").token}`;
    applyLedger({ userId: uid, type: "deposit", amountCents: 500000, idempotencyKey: "d" });
  });
  const get = async () => (await (sessionGET as unknown as Route)(new Request("http://x/api/session", { headers: { cookie } }))).json();
  const post = async (body: object) => (sessionPOST as unknown as Route)(new Request("http://x/api/session", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) }));
  const spin = async (i: number) => (slotPOST as unknown as Route)(new Request("http://x/api/games/slot", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ coinCents: 100, idempotencyKey: `s${i}` }) }));

  it("is off by default and lists the budget choices", async () => {
    const d = await get();
    expect(d.budget).toEqual({ cents: null, pending: null });
    expect(d.reality.minutes).toBeNull();
    expect(d.choices.budget).toEqual(BUDGET_CHOICES);
    const a = await (await (activityGET as unknown as Route)(new Request("http://x/api/session/activity", { headers: { cookie } }))).json();
    expect(a.checkIns).toBe(false);
  });
  it("saving one setting never turns another off; budget saves and its pending change can be kept", async () => {
    expect((await post({ realityMin: 30 })).status).toBe(200);
    let d = await (await post({ budgetCents: 2500 })).json();
    expect(d.budget.cents).toBe(2500);
    expect(d.reality.minutes).toBe(30);
    d = await (await post({ realityMin: 15 })).json();
    expect(d.budget.cents).toBe(2500);
    d = await (await post({ budgetCents: null })).json();
    expect(d.result.budget.applied).toBe("pending");
    expect(d.budget.cents).toBe(2500);
    d = await (await post({ cancelPending: "budget" })).json();
    expect(d.budget.pending).toBeNull();
    expect((await post({ budgetCents: 777 })).status).toBe(400);
    const a = await (await (activityGET as unknown as Route)(new Request("http://x/api/session/activity", { headers: { cookie } }))).json();
    expect(a.checkIns).toBe(true);
  });
  it("the card's net is the real session ledger net of real spins, and the budget trigger follows it", async () => {
    await post({ budgetCents: 1000 });
    let paid = 0, bet = 0;
    for (let i = 0; i < 40; i++) {
      const j = await (await spin(i)).json();
      bet += j.spin.betCents; paid += j.spin.winCents;
    }
    const d = await get();
    expect(d.session.active).toBe(true);
    expect(d.session.netCents).toBe(paid - bet);
    const due = checkInDue({ active: true, minutes: d.session.minutes, netCents: d.session.netCents, everyMin: d.reality.minutes, budgetCents: d.budget.cents, ack: { t: 0, b: 0 } });
    if (paid - bet <= -1000) expect(due).toMatchObject({ budget: true, b: Math.floor((bet - paid) / 1000) });
    else expect(due).toBeNull();
  }, 30_000);
  it("Take a break starts the real 30-minute server pause: new bets are refused, and it can't be shortened", async () => {
    expect((await spin(1)).status).toBe(200);
    const d = await (await post({ takeBreak: true })).json();
    expect(d.breakUntil).toBeTruthy();
    expect(d.breakKind).toBe("break");
    const mins = (Date.parse(d.breakUntil) - Date.now()) / 60000;
    expect(mins).toBeGreaterThan(29); expect(mins).toBeLessThanOrEqual(30.1);
    const r = await spin(2);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await r.json())).toMatch(/break/i);
    // it can't be cut short: a shorter request keeps the existing end time
    expect(takeBreak(getDb(), uid, new Date(Date.parse(d.breakUntil) - 40 * 60000))).toBe(d.breakUntil);
    expect(currentSession(getDb(), uid).active).toBe(true);
  });
});

describe("card + settings copy: calm, opt-in, honest", () => {
  const card = src("src/components/RealityCheck.tsx");
  const lib = src("src/lib/checkIn.ts");
  const panel = src("src/components/SessionPanel.tsx");
  const strip = src("src/components/SessionStrip.tsx");
  const css = src("src/app/globals.css");
  const copy = Object.values(CHECKIN_COPY).map((v) => (typeof v === "function" ? (v as (n: number) => string)(2500) : v)).join(" \n ");
  const BANNED = [/countdown/i, /seconds? left/i, /\bhurry\b/i, /\bquick(ly)?\b/i, /\bdon'?t miss\b/i, /\blast chance\b/i, /\bwin (it )?back\b/i, /\bchase/i,
    /\balmost\b/i, /so close/i, /\bdue\b/i, /\bhot\b/i, /\blucky\b/i, /\bstreak/i, /\bbonus\b/i, /\bnow or never\b/i, /\bonly \d+/i, /\bexpires?\b/i];
  it.each(BANNED.map((re) => [re]))("no %s in the check-in copy", (re) => {
    expect(copy).not.toMatch(re);
    expect(card.replace(/\/\*\*[\s\S]*?\*\//g, "")).not.toMatch(re);
  });
  it("has equal Keep playing / Take a break buttons, sandbox chip, limits link and helpline", () => {
    expect(copy).toMatch(/Keep playing/);
    expect(copy).toMatch(/Take a break/);
    expect(card).toContain("<SandboxChip");
    expect(card).toContain('href="/wallet#time"');
    expect(CHECKIN_COPY.help).toBe("Help: 1-800-GAMBLER · 21+");
    expect(CHECKIN_COPY.calm).toMatch(/no timer/);
    expect((card.match(/className="btn"/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(card).not.toMatch(/btn-primary/);
  });
  it("Take a break calls the real server pause, not just a link", () => {
    expect(card).toMatch(/takeBreak: true/);
    expect(card).toMatch(/pit:session/);
  });
  it("shows only figures from /api/session, no timers ticking down", () => {
    expect(card).toMatch(/api\("\/api\/session"\)/);
    expect(card).not.toMatch(/setTimeout|requestAnimationFrame|Math\.random/);
    expect(lib).not.toMatch(/Math\.random|Date\.now/);
  });
  it("is opt-in in the Cage and the strip doesn't double up", () => {
    expect(panel).toMatch(/Session budget check-in/);
    expect(panel).toMatch(/<option value="">Off<\/option>/);
    expect(panel).toMatch(/budgetCents: bg \|\| null/);
    expect(strip).toMatch(/!d\.checkIns && nudgeDue/);
  });
  it("respects Reduced Motion: the fade-in only runs with no-preference", () => {
    const i = css.indexOf("SS5: opt-in check-in card");
    const block = css.slice(i);
    expect(block).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{ \.checkin-card \{ animation/);
    expect(block.replace(/@media \(prefers-reduced-motion: no-preference\)[^\n]*\n/, "")).not.toMatch(/\.checkin-card[^{]*\{[^}]*animation/);
  });
});
