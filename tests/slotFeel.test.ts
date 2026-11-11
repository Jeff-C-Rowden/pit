import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SLOT_STOP_MS_NORMAL,
  SLOT_STOP_MS_TURBO,
  SLOT_BLUR_MS_NORMAL,
  SLOT_BLUR_MS_TURBO,
  SLOT_STOP_STAGGER_MS,
  SLOT_BOUNCE_PX,
  SLOT_SETTLE_MS_NORMAL,
  SLOT_SETTLE_MS_TURBO,
  SLOT_PREV_LAST_STOP_MS,
  slotStopMs,
  slotBlurCycleMs,
  slotTurboEffective,
  slotStaggerStops,
  slotLandPlan,
  shouldReelBounce,
  slotReelOffset,
} from "../src/lib/slotFeel";
import { buckshotStopSchedule } from "../src/components/BuckshotMachine";

const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

const VIDEO_CABINETS = [
  "src/components/SlotMachine.tsx",
  "src/components/VaultSpireMachine.tsx",
  "src/components/MineMachine.tsx",
  "src/components/PrairieMachine.tsx",
  "src/components/CloverMachine.tsx",
];

describe("slotStopMs", () => {
  it("returns staggered normal durations matching the cabinets", () => {
    expect([...SLOT_STOP_MS_NORMAL]).toEqual([2400, 2520, 2640, 2760, 2880]);
    for (let i = 0; i < 5; i++) {
      expect(slotStopMs(i, false)).toBe(SLOT_STOP_MS_NORMAL[i]);
    }
  });

  it("returns staggered turbo durations that stay shorter than normal", () => {
    expect([...SLOT_STOP_MS_TURBO]).toEqual([900, 1020, 1140, 1260, 1380]);
    for (let i = 0; i < 5; i++) {
      expect(slotStopMs(i, true)).toBe(SLOT_STOP_MS_TURBO[i]);
    }
  });

  it("makes every turbo reel strictly shorter than normal", () => {
    for (let i = 0; i < 5; i++) {
      expect(slotStopMs(i, true)).toBeLessThan(slotStopMs(i, false));
    }
  });

  it("keeps a fixed left-to-right stagger of ~120ms in both modes", () => {
    expect(SLOT_STOP_STAGGER_MS).toBe(120);
    for (let i = 1; i < 5; i++) {
      expect(slotStopMs(i, false) - slotStopMs(i - 1, false)).toBe(SLOT_STOP_STAGGER_MS);
      expect(slotStopMs(i, true) - slotStopMs(i - 1, true)).toBe(SLOT_STOP_STAGGER_MS);
    }
  });

  it("clamps out-of-range reel indexes", () => {
    expect(slotStopMs(-1, false)).toBe(SLOT_STOP_MS_NORMAL[0]);
    expect(slotStopMs(99, true)).toBe(SLOT_STOP_MS_TURBO[4]);
  });
});

describe("slotStaggerStops", () => {
  it("builds a left-to-right schedule from a first-stop time", () => {
    expect(slotStaggerStops(700, 3)).toEqual([700, 820, 940]);
    expect(slotStaggerStops(250, 3)).toEqual([250, 370, 490]);
    expect(slotStaggerStops(2400, 5)).toEqual([...SLOT_STOP_MS_NORMAL]);
  });
});

describe("slotBlurCycleMs", () => {
  it("uses a faster blur cycle in turbo", () => {
    expect(slotBlurCycleMs(false)).toBe(SLOT_BLUR_MS_NORMAL);
    expect(slotBlurCycleMs(true)).toBe(SLOT_BLUR_MS_TURBO);
    expect(slotBlurCycleMs(true)).toBeLessThan(slotBlurCycleMs(false));
  });
});

describe("slotTurboEffective", () => {
  it("is off by default", () => {
    expect(slotTurboEffective(false, false)).toBe(false);
  });

  it("honors the user Turbo toggle", () => {
    expect(slotTurboEffective(true, false)).toBe(true);
  });

  it("forces turbo when prefers-reduced-motion is on", () => {
    expect(slotTurboEffective(false, true)).toBe(true);
    expect(slotTurboEffective(true, true)).toBe(true);
  });
});

describe("slotLandPlan (S1 weighted stops)", () => {
  it("uses a 4–6px overshoot and a short settle after the stop", () => {
    expect(SLOT_BOUNCE_PX).toBeGreaterThanOrEqual(4);
    expect(SLOT_BOUNCE_PX).toBeLessThanOrEqual(6);
    const plan = slotLandPlan({ reelIndex: 0, turbo: false });
    expect(plan.stopMs).toBe(2400);
    expect(plan.bouncePx).toBe(SLOT_BOUNCE_PX);
    expect(plan.settleMs).toBe(SLOT_SETTLE_MS_NORMAL);
    expect(plan.totalMs).toBe(2400 + SLOT_SETTLE_MS_NORMAL);
    expect(plan.slammed).toBe(false);
  });

  it("shortens the settle in turbo but still bounces", () => {
    const plan = slotLandPlan({ reelIndex: 2, turbo: true });
    expect(plan.stopMs).toBe(1140);
    expect(plan.bouncePx).toBe(SLOT_BOUNCE_PX);
    expect(plan.settleMs).toBe(SLOT_SETTLE_MS_TURBO);
    expect(plan.settleMs).toBeLessThan(SLOT_SETTLE_MS_NORMAL);
    expect(plan.totalMs).toBe(1140 + SLOT_SETTLE_MS_TURBO);
  });

  it("drops the bounce under prefers-reduced-motion", () => {
    const plan = slotLandPlan({ reelIndex: 3, turbo: false, reducedMotion: true });
    expect(plan.stopMs).toBe(slotStopMs(3, false));
    expect(plan.bouncePx).toBe(0);
    expect(plan.settleMs).toBe(0);
    expect(plan.totalMs).toBe(plan.stopMs);
    expect(shouldReelBounce({ reducedMotion: true, slammed: false })).toBe(false);
  });

  it("slams remaining reels immediately with no bounce", () => {
    const plan = slotLandPlan({ reelIndex: 4, turbo: false, slammed: true });
    expect(plan).toEqual({ stopMs: 0, bouncePx: 0, settleMs: 0, totalMs: 0, slammed: true });
    expect(shouldReelBounce({ reducedMotion: false, slammed: true })).toBe(false);
  });

  it("keeps a full 5-reel spin no longer than the previous last-reel stop", () => {
    expect(SLOT_PREV_LAST_STOP_MS).toBe(4800);
    const last = slotLandPlan({ reelIndex: 4, turbo: false });
    expect(last.totalMs).toBeLessThanOrEqual(SLOT_PREV_LAST_STOP_MS);
    const turboLast = slotLandPlan({ reelIndex: 4, turbo: true });
    expect(turboLast.totalMs).toBeLessThan(last.totalMs);
  });

  it("does not vary timing by outcome or near-miss", () => {
    expect(slotLandPlan.length).toBe(1);
    const a = slotLandPlan({ reelIndex: 1, turbo: false });
    const b = slotLandPlan({ reelIndex: 1, turbo: false });
    expect(a).toEqual(b);
    expect(a).not.toHaveProperty("nearMiss");
    expect(Object.keys(a).sort()).toEqual(["bouncePx", "settleMs", "slammed", "stopMs", "totalMs"].sort());
  });

  it("continues an overshoot in the direction of travel", () => {
    expect(slotReelOffset(-1000, 5)).toBe(-1005);
    expect(slotReelOffset(-1000, 0)).toBe(-1000);
    expect(slotReelOffset(0, 5)).toBe(-5);
  });
});

describe("buckshotStopSchedule uses the shared stagger", () => {
  it("stops 3 reels left to right ~120ms apart, no longer than before", () => {
    expect(buckshotStopSchedule(false, false)).toEqual([700, 820, 940]);
    expect(buckshotStopSchedule(true, false)).toEqual([250, 370, 490]);
    expect(Math.max(...buckshotStopSchedule(false, false))).toBeLessThanOrEqual(1600);
    expect(Math.max(...buckshotStopSchedule(true, false))).toBeLessThanOrEqual(650);
  });

  it("snaps all reels immediately under reduced motion", () => {
    expect(buckshotStopSchedule(false, true)).toEqual([0, 0, 0]);
    expect(buckshotStopSchedule(true, true)).toEqual([0, 0, 0]);
  });
});

describe("cabinets wire S1 bounce and thunk", () => {
  it("every video cabinet lands with the shared bounce plan, settle class, and soft thunk", () => {
    for (const file of VIDEO_CABINETS) {
      const src = read(file);
      expect(src, file).toMatch(/slotLandPlan|shouldReelBounce/);
      expect(src, file).toContain("is-settling");
      expect(src, file).toContain("playThunk");
    }
  });

  it("Buckshot/Bounty schedule comes from shared stagger and thunks on a natural stop", () => {
    const src = read("src/components/BuckshotMachine.tsx");
    expect(src).toMatch(/slotStaggerStops|slotStopSchedule|slotLandPlan/);
    expect(src).toContain("playThunk");
  });

  it("settle CSS is a 4–6px bounce and is off under reduced motion", () => {
    const global = read("src/app/globals.css");
    const cabinet = read("src/app/cabinet.css");
    expect(global).toMatch(/@keyframes\s+reel-settle/);
    expect(global).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*is-settling[\s\S]*animation:\s*none/);
    const bounce = Number(String(SLOT_BOUNCE_PX));
    expect(global).toMatch(new RegExp(String.raw`@keyframes\s+reel-settle[\s\S]{0,400}--reel-bounce,\s*` + bounce + "px"));
    // Buckshot's settle uses the same 4–6px travel, not a large % overshoot.
    expect(cabinet).not.toMatch(/@keyframes bbSettle[\s\S]*-10%/);
    expect(cabinet).toMatch(new RegExp(String.raw`(?:bbSettle|reel-settle)[\s\S]{0,400}--reel-bounce,\s*` + bounce + "px"));
  });
});
