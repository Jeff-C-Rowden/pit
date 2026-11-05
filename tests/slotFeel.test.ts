import { describe, it, expect } from "vitest";
import {
  SLOT_STOP_MS_NORMAL,
  SLOT_STOP_MS_TURBO,
  SLOT_BLUR_MS_NORMAL,
  SLOT_BLUR_MS_TURBO,
  slotStopMs,
  slotBlurCycleMs,
  slotTurboEffective,
} from "../src/lib/slotFeel";

describe("slotStopMs", () => {
  it("returns staggered normal durations matching the cabinets", () => {
    expect([...SLOT_STOP_MS_NORMAL]).toEqual([2400, 3000, 3600, 4200, 4800]);
    for (let i = 0; i < 5; i++) {
      expect(slotStopMs(i, false)).toBe(SLOT_STOP_MS_NORMAL[i]);
    }
  });

  it("returns staggered turbo durations ~40% of normal", () => {
    expect([...SLOT_STOP_MS_TURBO]).toEqual([900, 1100, 1300, 1500, 1700]);
    for (let i = 0; i < 5; i++) {
      expect(slotStopMs(i, true)).toBe(SLOT_STOP_MS_TURBO[i]);
    }
  });

  it("makes every turbo reel strictly shorter than normal", () => {
    for (let i = 0; i < 5; i++) {
      expect(slotStopMs(i, true)).toBeLessThan(slotStopMs(i, false));
    }
  });

  it("keeps left-to-right stagger in both modes", () => {
    for (let i = 1; i < 5; i++) {
      expect(slotStopMs(i, false)).toBeGreaterThan(slotStopMs(i - 1, false));
      expect(slotStopMs(i, true)).toBeGreaterThan(slotStopMs(i - 1, true));
    }
  });

  it("clamps out-of-range reel indexes", () => {
    expect(slotStopMs(-1, false)).toBe(SLOT_STOP_MS_NORMAL[0]);
    expect(slotStopMs(99, true)).toBe(SLOT_STOP_MS_TURBO[4]);
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
