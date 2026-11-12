import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import QuickBetRow from "@/components/QuickBet";
import { parseLastBets, recordLastBet, repeatBetState, TABLE_QUICK, lastBetRange } from "@/lib/quickBet";
import { startBlackjack } from "@/lib/games/blackjack";
import { startPaiGow } from "@/lib/games/paigow";

describe("table quick bet: limits match the tables", () => {
  it("blackjack chips and custom range are bets the server accepts", () => {
    for (const c of [...TABLE_QUICK.blackjack.chips, TABLE_QUICK.blackjack.min, TABLE_QUICK.blackjack.max]) {
      expect(() => startBlackjack(c)).not.toThrow();
    }
    expect(() => startBlackjack(TABLE_QUICK.blackjack.min - 1)).toThrow();
    expect(() => startBlackjack(TABLE_QUICK.blackjack.max + 1)).toThrow();
  });
  it("pai gow chips and custom range are bets the server accepts", () => {
    for (const c of [...TABLE_QUICK.paigow.chips, TABLE_QUICK.paigow.min, TABLE_QUICK.paigow.max]) {
      expect(() => startPaiGow(c)).not.toThrow();
    }
    expect(() => startPaiGow(TABLE_QUICK.paigow.min - 1)).toThrow();
    expect(() => startPaiGow(TABLE_QUICK.paigow.max + 1)).toThrow();
  });
});

describe("table quick bet: remembered bets", () => {
  it("table bets and slot coins live side by side without erasing each other", () => {
    let raw = recordLastBet(null, "slot", 25);
    raw = recordLastBet(raw, "blackjack", 2500);
    raw = recordLastBet(raw, "paigow", 10000);
    raw = recordLastBet(raw, "vault", 50);
    expect(parseLastBets(raw)).toEqual({ slot: 25, blackjack: 2500, paigow: 10000, vault: 50 });
  });
  it("rejects bets the table would refuse", () => {
    let raw = recordLastBet(null, "paigow", 100); // below $5 Pai Gow minimum
    raw = recordLastBet(raw, "blackjack", 600_000); // above $5,000 max
    raw = recordLastBet(raw, "blackjack", 99);
    expect(parseLastBets(raw)).toEqual({});
    expect(parseLastBets(JSON.stringify({ blackjack: 100, paigow: 499 }))).toEqual({ blackjack: 100 });
    expect(lastBetRange("blackjack")).toEqual({ min: 100, max: 500_000 });
  });
});

describe("table quick bet: repeat only when the balance covers it", () => {
  it("one bet per hand: repeat costs exactly the last bet", () => {
    expect(repeatBetState({ lastCoinCents: 2500, currentCoinCents: 1000, balanceCents: 2500, lines: 1, min: 100, max: 500_000 }))
      .toMatchObject({ show: true, enabled: true, totalCents: 2500, label: "Repeat $25.00", reason: null });
  });
  it("short balance: disabled with a reason, never shrunk", () => {
    expect(repeatBetState({ lastCoinCents: 2500, currentCoinCents: 1000, balanceCents: 2499, lines: 1, min: 100, max: 500_000 }))
      .toMatchObject({ show: true, enabled: false, coinCents: 2500, reason: "Needs $25.00 in sandbox chips" });
  });
});

function render(props: Partial<Parameters<typeof QuickBetRow>[0]> = {}) {
  return renderToStaticMarkup(createElement(QuickBetRow, {
    variant: "table",
    amounts: TABLE_QUICK.blackjack.chips,
    selected: 1000,
    onSelect: () => {},
    lastCoinCents: 5000,
    balanceCents: 100_000,
    busy: false,
    lines: 1,
    minCents: 100,
    maxCents: 500_000,
    onRepeat: () => {},
    ...props,
  }));
}

describe("table quick bet: rendered dock", () => {
  it("shows the chip row, a custom field and Repeat with the real bet", () => {
    const html = render();
    expect(html).toContain('aria-label="Bet size per hand (sandbox chips)"');
    expect(html.match(/clay-chip-btn/g)?.length).toBe(5);
    expect(html).toContain("Repeat $50.00");
    expect(html).toContain("Repeat last bet: $50.00 and deal");
    expect(html).not.toMatch(/× 1 lines|per line/);
    expect(html).not.toMatch(/<button[^>]*repeat-bet[^>]*disabled/);
  });
  it("Repeat is disabled when the balance can't cover it, and while dealing", () => {
    expect(render({ balanceCents: 4999 })).toMatch(/<button[^>]*disabled[^>]*>.*Repeat \$50\.00/);
    expect(render({ busy: true })).toMatch(/<button[^>]*disabled[^>]*>.*Repeat \$50\.00/);
  });
  it("no Repeat when nothing was bet yet or Deal already is the repeat", () => {
    expect(render({ lastCoinCents: null })).not.toContain("Repeat");
    expect(render({ lastCoinCents: 1000 })).not.toContain("Repeat");
  });
  it("slot docks keep their per-line labels", () => {
    const html = render({ variant: "slot", amounts: [25, 50], selected: 25, lastCoinCents: 50, lines: 9, minCents: 25, maxCents: 5000 });
    expect(html).toContain("Coin size per line");
    expect(html).toContain("Repeat $4.50");
  });
});
