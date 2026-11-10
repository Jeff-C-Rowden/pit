import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseLastBets, recordLastBet, repeatBetState, SLOT_COIN_CHIPS, LAST_BET_KEY } from "@/lib/quickBet";

describe("quick bet: last accepted bet storage", () => {
  it("survives corrupt or hostile storage", () => {
    expect(parseLastBets(null)).toEqual({});
    expect(parseLastBets("{nope")).toEqual({});
    expect(parseLastBets("[100]")).toEqual({});
    expect(parseLastBets(JSON.stringify({ slot: 100, vault: 99999, x: "100", "<b>": 50, frac: 25.5 }))).toEqual({ slot: 100 });
  });
  it("records per table and rejects out-of-range coins", () => {
    let raw = recordLastBet(null, "slot", 250);
    raw = recordLastBet(raw, "vault", 50);
    raw = recordLastBet(raw, "vault", 10); // below min: ignored
    raw = recordLastBet(raw, "slot", 6000); // above max: ignored
    expect(parseLastBets(raw)).toEqual({ slot: 250, vault: 50 });
    expect(LAST_BET_KEY).toBe("pit.lastBet.v1");
  });
});

describe("quick bet: repeat button state", () => {
  const base = { currentCoinCents: 100, balanceCents: 10_000 };
  it("hidden with no history or when Spin already is the repeat", () => {
    expect(repeatBetState({ ...base, lastCoinCents: null })).toEqual({ show: false });
    expect(repeatBetState({ ...base, lastCoinCents: 100 })).toEqual({ show: false });
    expect(repeatBetState({ ...base, lastCoinCents: 7 })).toEqual({ show: false });
  });
  it("shows the full 9-line cost honestly", () => {
    const s = repeatBetState({ ...base, lastCoinCents: 250 });
    expect(s).toMatchObject({ show: true, enabled: true, coinCents: 250, totalCents: 2250, label: "Repeat $22.50", reason: null });
  });
  it("never bypasses balance: disabled with a reason, bet not shrunk", () => {
    const s = repeatBetState({ ...base, balanceCents: 2249, lastCoinCents: 250 });
    expect(s).toMatchObject({ show: true, enabled: false, totalCents: 2250, reason: "Needs $22.50 in sandbox chips" });
  });
  it("disabled while a spin is in flight", () => {
    expect(repeatBetState({ ...base, lastCoinCents: 50, busy: true })).toMatchObject({ show: true, enabled: false });
  });
  it("chip row stays within published coin range", () => {
    expect([...SLOT_COIN_CHIPS]).toEqual([25, 50, 100, 250, 500]);
  });
});

describe("quick bet: wiring", () => {
  it("both slot cabinets use the shared dock and record only after server accepts", () => {
    for (const f of ["src/app/slot/page.tsx", "src/app/vault/page.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).toContain("QuickBetRow");
      // last bet is remembered only after the POST resolves (server accepted it)
      expect(src.indexOf("rememberCoin(c)")).toBeGreaterThan(src.indexOf("await api("));
      // repeat goes through the same go() path, so the server validates it like any spin
      expect(src).toMatch(/onRepeat=\{\(c\) => \{[^}]*void go\(c\)/);
    }
  });
  it("reduced motion: thumb dock adds no animation outside the no-preference guard", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const block = css.slice(css.indexOf("/* m7: quick bet"), css.indexOf("/* /m7 */"));
    expect(block.length).toBeGreaterThan(50);
    expect(block).not.toMatch(/animation:/);
  });
});
