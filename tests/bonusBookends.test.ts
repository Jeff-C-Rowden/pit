import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  balanceBeforeCollect,
  bonusIntro,
  buildSummary,
  cloverSummary,
  INTRO_NOTE,
  mineSummary,
  prairieSummary,
  spinHasFeature,
  SUMMARY_NOTE,
} from "@/lib/bonusBookends";
import { playMine, publicMineSpin, MINE_FS_CAP } from "@/lib/games/mine";
import { playPrairie, publicPrairieSpin, PR_FS_CAP } from "@/lib/games/prairie";
import { playClover, publicCloverSpin, CL_FS_CAP } from "@/lib/games/clover";

const src = (p: string) => readFileSync(p, "utf8");

function rng(seed: number) {
  let a = seed >>> 0;
  return (n: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

function featureSpins<T>(play: (pick: (n: number) => number) => T, has: (s: T) => boolean, want = 40, seed = 7): T[] {
  const pick = rng(seed);
  const out: T[] = [];
  for (let i = 0; i < 200000 && out.length < want; i++) {
    const s = play(pick);
    if (has(s)) out.push(s);
  }
  return out;
}

describe("Slot Scout S5: intro card", () => {
  it("says what was won with one rule line and never reveals the feature's pay", () => {
    const i = bonusIntro("mine", { kind: "fs", spins: 10, scatters: 3 }, 225);
    expect(i.title).toBe("10 Free Spins");
    expect(i.won).toBe("10 free spins at your $2.25 bet, at no cost");
    expect(i.rule).toMatch(/×2/);
    expect(i.start).toBe("Start free spins");
    expect(JSON.stringify(i)).not.toMatch(/countdown|hurry|seconds|due|hot/i);
    expect(bonusIntro("mine", { kind: "pick" }, 225).title).toBe("Mine Cart Pick");
    expect(bonusIntro("prairie", { kind: "hold", coins: 6 }, 250)).toMatchObject({ title: "Hold & Spin", kicker: "6 herd coins", start: "Start Hold & Spin" });
    expect(bonusIntro("clover", { kind: "wheel" }, 250).start).toBe("Spin the wheel");
    expect(bonusIntro("clover", { kind: "fs", spins: 8, source: "wheel" }, 250).kicker).toBe("From the Rainbow Wheel");
    expect(bonusIntro("prairie", { kind: "fs", spins: 1 }, 250).title).toBe("1 Free Spin");
    for (const i2 of [bonusIntro("mine", { kind: "pick" }, 225), bonusIntro("prairie", { kind: "hold", coins: 6 }, 250), bonusIntro("clover", { kind: "wheel" }, 250)]) {
      expect(i2.rule.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(2);
      expect(i2.won).not.toMatch(/\$\d+\.\d\d.*won/);
    }
    expect(INTRO_NOTE).toMatch(/doesn't change the odds of the next spin/);
    expect(SUMMARY_NOTE).toMatch(/Collect shows it on your Balance/);
  });
});

describe("Slot Scout S5: summary card uses the server's settled amounts", () => {
  it("buildSummary formats rows, net and the Collect label without inventing money", () => {
    const s = buildSummary([{ label: "Base spin", cents: 0 }, { label: "Free spins", cents: 1350 }], 1350, 225, ["10 free spins"], null);
    expect(s).toMatchObject({ total: "$13.50", bet: "$2.25", net: "+$11.25", tone: "up", played: "10 free spins", rowsAddUp: true, collect: "Collect $13.50" });
    const low = buildSummary([{ label: "Base spin", cents: 0 }, { label: "Free spins", cents: 90 }], 90, 225, [], null);
    expect(low).toMatchObject({ net: "−$1.35", tone: "down", played: null });
    const junk = buildSummary([{ label: "x", cents: Number.NaN }], -5, Number.NaN, [], null);
    expect(junk).toMatchObject({ totalCents: 0, total: "$0.00", net: "$0.00", tone: "even" });
    expect(buildSummary([{ label: "x", cents: 100 }], 200, 90, [], null).rowsAddUp).toBe(false);
  });

  it("Canary Creek Mine: rows add up to the server win on real engine feature spins", () => {
    const spins = featureSpins((p) => publicMineSpin(playMine(25, p)), (s) => spinHasFeature(s));
    expect(spins.length).toBe(40);
    for (const s of spins) {
      const sum = mineSummary(s, MINE_FS_CAP);
      expect(sum.rowsAddUp).toBe(true);
      expect(sum.totalCents).toBe(s.winCents);
      if (s.freeSpins) expect(sum.played).toContain(`${s.freeSpins.spins.length} free spin`);
      if (s.pick) expect(sum.played).toContain(`${s.pick.reveals.length} cart`);
    }
  });

  it("Thunderhoof Prairie: rows add up, respins and free spins counted", () => {
    const spins = featureSpins((p) => publicPrairieSpin(playPrairie(25, p)), (s) => spinHasFeature(s));
    expect(spins.length).toBe(40);
    for (const s of spins) {
      const sum = prairieSummary(s, PR_FS_CAP);
      expect(sum.rowsAddUp).toBe(true);
      expect(sum.totalCents).toBe(s.winCents);
      if (s.hold) expect(sum.played).toContain(`${s.hold.respins.length} respin`);
    }
  });

  it("Kettle of Clover: wheel, wheel free spins and kettle free spins all add up", () => {
    const spins = featureSpins((p) => publicCloverSpin(playClover(25, p)), (s) => spinHasFeature(s));
    expect(spins.length).toBe(40);
    for (const s of spins) {
      const sum = cloverSummary(s, CL_FS_CAP);
      expect(sum.rowsAddUp).toBe(true);
      expect(sum.totalCents).toBe(s.winCents);
      if (s.wheel) expect(sum.played).toMatch(/wheel spin/);
    }
  });

  it("non-feature spins get no bookends", () => {
    expect(spinHasFeature({ freeSpins: null, pick: null })).toBe(false);
    expect(spinHasFeature(null)).toBe(false);
    expect(spinHasFeature({ hold: { totalWinCents: 0 } })).toBe(true);
  });
});

describe("Slot Scout S5: Balance waits for Collect", () => {
  it("shows the true post-bet balance while the feature plays", () => {
    expect(balanceBeforeCollect(10_000, 1_350)).toBe(8_650);
    expect(balanceBeforeCollect(100, 500)).toBe(0);
    expect(balanceBeforeCollect(5_000, Number.NaN)).toBe(5_000);
  });
});

describe("Slot Scout S5: wiring", () => {
  it("Kettle of Clover reuses the Rainbow Wheel's own player-paced screen instead of stacking a second intro", () => {
    const s = src("src/app/clover/page.tsx");
    expect(s).toMatch(/if \(st\.kind === "wheel"\) \{ setTrigger\(null\); setPh\("wheel"\); return; \}/);
    expect(s).toMatch(/st\.fs\.source === "wheel"/);
    expect(src("src/components/RainbowWheel.tsx")).toMatch(/<SandboxChip \/>/);
  });
  const card = src("src/components/BonusBookend.tsx");
  it("cards are portaled dialogs with focus, Esc and no timers", () => {
    expect(card).toMatch(/createPortal\(/);
    expect(card).toMatch(/document\.body/);
    expect(card).toMatch(/role="dialog"/);
    expect(card).toMatch(/aria-modal="true"/);
    expect(card).toMatch(/btnRef\.current\?\.focus\(\)/);
    expect(card).toMatch(/"Escape"/);
    expect(card).toMatch(/<SandboxChip \/>/);
    expect(card).not.toMatch(/setTimeout|setInterval/);
  });
  it.each([
    ["src/app/mine/page.tsx", "mineSummary"],
    ["src/app/prairie/page.tsx", "prairieSummary"],
    ["src/app/clover/page.tsx", "cloverSummary"],
  ])("%s uses the intro + summary cards and defers the feature credit until Collect", (p, summary) => {
    const s = src(p);
    expect(s).toMatch(/<BonusIntroCard/);
    expect(s).toMatch(new RegExp(`<BonusSummaryCard[^>]*${summary}\\(spin`));
    expect(s).toMatch(/credit\.accept\(d\.user, d\.spin\)/);
    expect(s).toMatch(/credit\.release\(\)/);
    expect(s).not.toMatch(/TriggerBanner/);
    // the old auto-advancing 2-second trigger hold is gone
    expect(s).not.toMatch(/reducedMotion\(\) \? 900 : 2000/);
  });
});
