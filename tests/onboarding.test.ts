import { describe, it, expect } from "vitest";
import { TOUR_STEPS, nextStep, prevStep, isLast, welcomeKey, WELCOME_CHIPS_CENTS } from "../src/lib/onboarding/tour";

describe("onboarding tour", () => {
  it("clamps navigation", () => {
    expect(prevStep(0)).toBe(0);
    expect(nextStep(TOUR_STEPS.length - 1)).toBe(TOUR_STEPS.length - 1);
    expect(isLast(TOUR_STEPS.length - 1)).toBe(true);
    expect(isLast(0)).toBe(false);
  });
  it("labels chips as sandbox and mentions responsible play", () => {
    expect(TOUR_STEPS[0].body).toMatch(/sandbox/i);
    expect(TOUR_STEPS.some((s) => /limit/i.test(s.body))).toBe(true);
    expect(TOUR_STEPS.some((s) => /house has an edge/i.test(s.body))).toBe(true);
  });
  it("uses a per-user idempotent claim and an allowed Cage amount", () => {
    expect(welcomeKey("u1")).toBe("welcome-u1");
    expect([1000, 2500, 5000, 10000, 25000, 50000, 100000]).toContain(WELCOME_CHIPS_CENTS);
  });
});
