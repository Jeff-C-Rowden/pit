import { describe, it, expect } from "vitest";
import { planSpin, simulate, pocketAt, FPS, R_TRACK, R_REST, SLICE } from "../src/lib/games/rouletteBall";
import { WHEEL_ORDER } from "../src/lib/games/rouletteFelt";

const mod = (x: number, m: number) => ((x % m) + m) % m;

describe("roulette ball physics solver", () => {
  for (const turbo of [false, true]) {
    it(`lands on every pocket for many seeds (${turbo ? "turbo" : "normal"})`, () => {
      for (const pocket of WHEEL_ORDER) {
        for (let seed = 1; seed <= 6; seed++) {
          const rotor0 = (seed * 47.3) % 360;
          const p = planSpin(pocket, rotor0, { turbo, seed: seed * 7919 + pocket.length });
          const last = p.frames[p.frames.length - 1]!;
          expect(pocketAt(last.ball, last.rotor)).toBe(pocket);
          // starts on the outer track at the current rotor angle (no rotor jump)
          expect(p.frames[0]!.r).toBe(R_TRACK);
          expect(Math.abs(p.frames[0]!.rotor - rotor0)).toBeLessThan(1);
          // ends resting in the pocket, centred, riding with the rotor
          expect(last.r).toBeCloseTo(R_REST, 0);
          const rel = mod(last.ball - last.rotor, 360);
          expect(Math.abs(mod(rel, SLICE) - SLICE / 2)).toBeLessThan(SLICE * 0.3);
          // phases happen in physical order
          expect(p.phaseAt.fall).toBeGreaterThan(0);
          expect(p.phaseAt.rattle).toBeGreaterThan(p.phaseAt.fall);
          expect(p.phaseAt.settled).toBeGreaterThan(p.phaseAt.rattle);
          if (turbo) expect(p.durationMs).toBeLessThan(4500);
          else expect(p.durationMs).toBeGreaterThan(4500);
        }
      }
    });
  }

  it("is deterministic for a seed and never teleports between frames", () => {
    const a = simulate(42, 10);
    const b = simulate(42, 10);
    expect(a.frames).toEqual(b.frames);
    for (let s = 1; s < 300; s++) {
      const { frames, phaseAt } = simulate(s, s * 3, s % 2 === 0);
      for (let i = 1; i < frames.length; i++) {
        const f = frames[i]!, g = frames[i - 1]!;
        // ball top speed is ~1000 deg/s, so at most ~17 deg per 60fps frame
        expect(Math.abs(f.ball - g.ball)).toBeLessThan(1100 / FPS);
        expect(Math.abs(f.r - g.r)).toBeLessThan(12);
        expect(Math.abs(f.rotor - g.rotor)).toBeLessThan(60 / FPS);
        // ball only moves inward overall: never back up to the track after leaving
        if (i > phaseAt.fall + 2) expect(f.r).toBeLessThan(R_TRACK);
      }
    }
  });

  it("ball counter-rotates against the rotor on the track", () => {
    const { frames, phaseAt } = simulate(5, 0);
    const f0 = frames[0]!, f1 = frames[Math.floor(phaseAt.fall / 2)]!;
    expect(f1.ball - f0.ball).toBeLessThan(0);
    expect(f1.rotor - f0.rotor).toBeGreaterThan(0);
  });
});
