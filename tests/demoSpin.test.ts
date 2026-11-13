import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resetDbForTests } from "../src/lib/db";
import { BB_REELS, exactBuckshotRtp, spinBuckshot } from "../src/lib/games/buckshot";
import { BUCKSHOT_MATH } from "../src/lib/gameMath";
import {
  DEMO_COINS, DEMO_DENOM_CENTS, DEMO_LABEL, DEMO_RTP_LINE, DEMO_START_CENTS, DEMO_STORAGE_KEY,
  demoBuckshotSpin, demoKindLabel, demoResultLine, freshDemo, loadDemo, playDemo, saveDemo, uniformPick,
} from "../src/lib/demoSpin";
import { formatCents } from "../src/lib/money";

const src = (p: string) => readFileSync(p, "utf8");
const seq = (xs: number[]) => { let i = 0; return (n: number) => xs[i++]! % n; };

afterEach(() => vi.restoreAllMocks());

describe("#11 guest demo spin: honest math", () => {
  it("matches the real server spin exactly for the same stops (same strips, window, paytable)", () => {
    for (let k = 0; k < 500; k++) {
      const stops = BB_REELS.map((r) => Math.floor(Math.random() * r.length));
      const demo = demoBuckshotSpin(seq(stops));
      const real = spinBuckshot(DEMO_COINS, DEMO_DENOM_CENTS, seq(stops));
      expect(demo.stops).toEqual(real.stops);
      expect(demo.window).toEqual(real.window);
      expect(demo.line).toEqual(real.line);
      expect(demo.payCoins).toBe(real.payCoins);
      expect(demo.kind).toBe(real.kind);
      expect(demo.winCents).toBe(real.winCents);
      expect(demo.betCents).toBe(real.betCents);
    }
  });

  it("over every stop combination returns the published 3-coin RTP (no rigged first win, no reweighting)", () => {
    const [a, b, c] = BB_REELS.map((r) => r.length) as [number, number, number];
    let pay = 0, bet = 0, hits = 0, n = 0;
    for (let x = 0; x < a; x++) for (let y = 0; y < b; y++) for (let z = 0; z < c; z++) {
      const s = demoBuckshotSpin(seq([x, y, z]));
      pay += s.winCents; bet += s.betCents; n++; if (s.winCents > 0) hits++;
    }
    expect(n).toBe(a * b * c);
    expect(pay / bet).toBeCloseTo(exactBuckshotRtp(3).rtp, 12);
    expect(pay / bet).toBeCloseTo(BUCKSHOT_MATH.rtp3, 5);
    expect(hits / n).toBeCloseTo(BUCKSHOT_MATH.hitRate, 12);
    expect(DEMO_RTP_LINE).toContain("94.67%");
  });

  it("uniformPick is unbiased (rejection sampling) and in range", () => {
    // 2^32 is not a multiple of 26: values at or above the limit are rejected and redrawn
    const limit = Math.floor(2 ** 32 / 26) * 26;
    const draws = [limit, 2 ** 32 - 1, 27];
    let i = 0;
    expect(uniformPick(26, () => draws[i++]!)).toBe(1);
    expect(i).toBe(3);
    for (let k = 0; k < 200; k++) {
      const v = uniformPick(24, () => Math.floor(Math.random() * 2 ** 32));
      expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(24);
    }
    expect(() => uniformPick(0, () => 0)).toThrow();
  });

  it("default pick uses the browser CSPRNG (crypto.getRandomValues)", () => {
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    demoBuckshotSpin();
    expect(spy).toHaveBeenCalledTimes(3);
  });
});

describe("#11 guest demo spin: browser-only chips, no ledger writes", () => {
  it("one spin debits the bet and credits the real win on the tab-only stack, then refuses", () => {
    const s0 = freshDemo();
    expect(s0.balanceCents).toBe(DEMO_START_CENTS);
    const stops = [12, 12, 8];
    const s1 = playDemo(s0, seq(stops));
    const real = spinBuckshot(DEMO_COINS, DEMO_DENOM_CENTS, seq(stops));
    expect(s1.balanceCents).toBe(DEMO_START_CENTS - real.betCents + real.winCents);
    expect(s1.spinsLeft).toBe(0);
    expect(() => playDemo(s1)).toThrow(/sign up/);
  });

  it("writes no users / sessions / ledger / game rows and makes no network call", () => {
    const db = resetDbForTests();
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(["users", "sessions", "ledger", "game_states"]));
    const count = () => Object.fromEntries(tables.map((t) => [t, (db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as { n: number }).n]));
    const before = count();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    let st = freshDemo();
    st = playDemo(st);
    for (let k = 0; k < 200; k++) playDemo(freshDemo());
    vi.unstubAllGlobals();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(count()).toEqual(before);
    expect(st.spinsLeft).toBe(0);
  });

  it("the demo module and component never import the DB, ledger, auth or API client, and never fetch", () => {
    for (const f of ["src/lib/demoSpin.ts", "src/components/DemoSpin.tsx"]) {
      const s = src(f);
      expect(s).not.toMatch(/from ["'][^"']*(\/db|dbSync|ledger|auth|useUser|payments)["']/);
      expect(s).not.toMatch(/\bfetch\(|\bapi\(|XMLHttpRequest|sendBeacon/);
    }
    expect(src("src/components/DemoSpin.tsx")).not.toContain("localStorage");
  });

  it("persists only to sessionStorage-like storage and survives junk", () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(loadDemo(store)).toEqual(freshDemo());
    const s1 = playDemo(freshDemo(), seq([0, 0, 0]));
    saveDemo(store, s1);
    expect([...mem.keys()]).toEqual([DEMO_STORAGE_KEY]);
    expect(loadDemo(store)).toEqual(s1);
    mem.set(DEMO_STORAGE_KEY, "{not json");
    expect(loadDemo(store)).toEqual(freshDemo());
    mem.set(DEMO_STORAGE_KEY, JSON.stringify({ balanceCents: 5, spinsLeft: 99 }));
    expect(loadDemo(store).spinsLeft).toBe(1);
    expect(loadDemo(null)).toEqual(freshDemo());
  });
});

describe("#11 guest demo spin: labels and placement", () => {
  it("is labelled with the shared SandboxChip, RTP, 21+ and the $100 welcome call", () => {
    expect(DEMO_LABEL).toBe("Demo spin · sandbox chips · no cash value");
    const c = src("src/components/DemoSpin.tsx");
    expect(c).toContain("<SandboxChip label={DEMO_LABEL}");
    expect(c).toContain("DEMO_RTP_LINE");
    expect(c).toContain("21+");
    expect(c).toContain("WELCOME_CHIPS_CENTS");
    expect(c).toContain("sandbox welcome chips");
  });

  it("sits on the signup page (behind the 21+ gate), not on the open gate page", () => {
    expect(src("src/app/signup/page.tsx")).toContain("<DemoSpin");
    expect(src("src/app/page.tsx")).not.toContain("<DemoSpin");
    expect(src("src/middleware.ts")).toContain('const OPEN = new Set(["/", "/rules"])');
  });

  it("result lines are plain, with a true minus sign on a loss", () => {
    const loss = demoBuckshotSpin(seq([1, 1, 1])); // blanks on every payline stop
    expect(loss.winCents).toBe(0);
    expect(demoResultLine(loss, formatCents)).toContain("net −$0.75");
    expect(demoKindLabel("THREE BAR3")).toBe("Three triple bars");
    expect(demoKindLabel("2 CHERRIES")).toBe("2 cherries");
    expect(demoKindLabel("THREE WILDS")).toBe("Three wilds");
    const win = { ...loss, kind: "1 CHERRY", payCoins: 3, winCents: 75 };
    expect(demoResultLine(win, formatCents)).toBe("1 cherry pays $0.75 on a $0.75 spin · net $0.00.");
  });
});

describe("#11 live e2e never signs up", () => {
  it("tests/e2e/demo-spin.mjs stays signed out (no signup API, no form fill, checks user is null)", () => {
    const s = src("tests/e2e/demo-spin.mjs");
    expect(s).not.toMatch(/api\/auth\/signup|su-email|su-pass|api\/auth\/login/);
    expect(s).toContain("checks.stillSignedOut");
    expect(s).toContain("checks.noRequestsDuringSpin");
  });
});
