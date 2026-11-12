import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { addRecapSpin, EMPTY_RECAP, RECAP_MAX, recapRows, recapSummary, signedMoney } from "@/lib/spinRecap";

const src = (p: string) => readFileSync(p, "utf8");

describe("Slot Scout S4: session recap", () => {
  it("keeps the last 10 spins newest first but totals the whole visit", () => {
    let s = EMPTY_RECAP;
    for (let i = 1; i <= 12; i++) s = addRecapSpin(s, { betCents: 90, winCents: i === 12 ? 450 : 0 });
    expect(s.spins).toHaveLength(RECAP_MAX);
    expect(s.spins[0]!.n).toBe(12);
    expect(s.spins[9]!.n).toBe(3);
    expect(s.count).toBe(12);
    expect(s.betTotal).toBe(1080);
    expect(s.winTotal).toBe(450);
    const sum = recapSummary(s);
    expect(sum).toEqual({ spins: "12 spins", bet: "$10.80", won: "$4.50", net: "−$6.30", tone: "down" });
  });

  it("shows plain bet / win / net per spin with a real sign, never a plus on zero", () => {
    let s = addRecapSpin(EMPTY_RECAP, { betCents: 90, winCents: 90 });
    s = addRecapSpin(s, { betCents: 90, winCents: 45 });
    s = addRecapSpin(s, { betCents: 250, winCents: 1250, feature: true });
    const rows = recapRows(s);
    expect(rows[0]).toEqual({ n: 3, bet: "$2.50", win: "$12.50", net: "+$10.00", tone: "up", feature: true });
    expect(rows[1]).toMatchObject({ net: "−$0.45", tone: "down", feature: false });
    expect(rows[2]).toMatchObject({ net: "$0.00", tone: "even" });
    expect(signedMoney(0)).toBe("$0.00");
    expect(recapSummary(addRecapSpin(EMPTY_RECAP, { betCents: 90, winCents: 0 })).spins).toBe("1 spin");
  });

  it("ignores junk amounts instead of inventing money", () => {
    const s = addRecapSpin(EMPTY_RECAP, { betCents: Number.NaN, winCents: -5 });
    expect(s.betTotal).toBe(0);
    expect(s.winTotal).toBe(0);
  });

  it.each([
    "src/app/slot/page.tsx",
    "src/app/vault/page.tsx",
    "src/app/mine/page.tsx",
    "src/app/clover/page.tsx",
    "src/app/prairie/page.tsx",
    "src/components/BuckshotGame.tsx",
  ])("%s records settled spins and hands the recap to the Win meter", (p) => {
    const s = src(p);
    expect(s).toMatch(/useSpinRecap\(\)/);
    expect(s).toMatch(/recap=\{recap\}/);
    // recorded beside the Paid meter update, i.e. only after the reels / feature settle
    expect(s).toMatch(/setPaid\([^\n]+\n\s+if \([^\n]+\) addRecap\(/);
  });

  it("the sheet is an accessible, portaled dialog with the sandbox chip and an independence note", () => {
    const s = src("src/components/SpinRecap.tsx");
    expect(s).toMatch(/role="dialog"/);
    expect(s).toMatch(/aria-modal="true"/);
    expect(s).toMatch(/createPortal\(/);
    expect(s).toMatch(/<SandboxChip/);
    expect(src("src/lib/spinRecap.ts")).toMatch(/past spins don't change the next one/);
    expect(src("src/components/SlotCabinet.tsx")).toMatch(/aria-haspopup="dialog"/);
  });
});
