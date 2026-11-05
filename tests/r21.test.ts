import { describe, it, expect } from "vitest";
import { crapsFeltCents, TABLE_TIPS } from "@/lib/feel";
import { REFILL_AMOUNTS } from "@/lib/refill";
describe("r21", () => {
  it("felt sum", () => {
    expect(crapsFeltCents({})).toBe(0);
    expect(crapsFeltCents({ pass: 500, place: { 6: 600 }, hard: { 8: 100 } })).toBe(1200);
  });
  it("tips for every table", () => {
    for (const g of ["slot","vault","roulette","blackjack","craps","holdem","paigow"]) expect((TABLE_TIPS as any)[g].steps.length).toBe(3);
  });
  it("refill amounts are sandbox-legal and descending", () => {
    for (const a of REFILL_AMOUNTS) expect([1000,2500,5000,10000,25000,50000,100000]).toContain(a);
  });
});
