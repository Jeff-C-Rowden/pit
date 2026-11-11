import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { planSpin, pocketAt } from "../src/lib/games/rouletteBall";
import { WHEEL_ORDER } from "../src/lib/games/rouletteFelt";
import {
  drawnPocketUnderBall, ballPose, ballTransform, baseCam, spinCam, surfaceZ, pocketCentreDeg, R, C, VIEWS, SPEEDS,
} from "../src/lib/games/wheel3d";

describe("3D wheel shows only the server's pocket", () => {
  for (const turbo of [false, true]) {
    it(`ball rests in the drawn pocket the server returned, every pocket (${turbo ? "fast" : "regular"})`, () => {
      for (const server of WHEEL_ORDER) {
        for (let s = 1; s <= 3; s++) {
          const plan = planSpin(server, (s * 83.7) % 360, { turbo, seed: s * 104729 + server.length });
          const last = plan.frames[plan.frames.length - 1]!;
          // computed purely from the rendered geometry (ball x/y in the plane + rotor rotation)
          expect(drawnPocketUnderBall(last)).toBe(server);
          expect(pocketAt(last.ball, last.rotor)).toBe(server);
          // once settled, every remaining frame shows the same pocket (no late hop, no swap)
          for (let i = plan.phaseAt.settled; i < plan.frames.length; i++) expect(drawnPocketUnderBall(plan.frames[i]!)).toBe(server);
        }
      }
    });
  }
  it("the skip / reduced-motion / really-fast frame is the same resting frame", () => {
    const plan = planSpin("00", 12, { seed: 99 });
    expect(drawnPocketUnderBall(plan.frames.at(-1)!)).toBe("00");
  });
  it("pocket centres are drawn clockwise in wheel order", () => {
    expect(pocketCentreDeg("0")).toBeCloseTo(360 / 38 / 2);
    expect(pocketCentreDeg("00")).toBeCloseTo((19 + 0.5) * (360 / 38));
    expect(() => pocketCentreDeg("37")).toThrow();
  });
});

describe("3D depth and camera", () => {
  it("ball sits on the track, drops down the cone, rests in the recessed pocket", () => {
    expect(surfaceZ(197)).toBeGreaterThan(surfaceZ(160));
    expect(surfaceZ(160)).toBeGreaterThan(surfaceZ(100));
    const plan = planSpin("17", 0, { seed: 5 });
    const p = ballPose(plan.frames.at(-1)!);
    expect(Math.hypot(p.x - C, p.y - C)).toBeLessThan(R.pocketOut);
    expect(Math.hypot(p.x - C, p.y - C)).toBeGreaterThan(R.pocketIn);
  });
  it("ball is a billboard facing the camera at the current tilt", () => {
    const p = ballPose({ rotor: 0, ball: 90, r: 197, lift: 0 });
    expect(ballTransform(p, 56)).toContain("rotateX(-56.00deg)");
  });
  it("bird's-eye and reduced motion never move the camera", () => {
    for (const t of [0, 1, 5, 9]) {
      expect(spinCam("bird", t, 6, null)).toEqual(baseCam("bird"));
      expect(spinCam("rail", t, 6, null, true)).toEqual(baseCam("rail"));
    }
  });
  it("seated camera pushes in during the spin, then closes up on the resting pocket", () => {
    const plan = planSpin("5", 0, { seed: 7 });
    const rest = plan.frames.at(-1)!;
    const settleAt = plan.phaseAt.settled / 60;
    const early = spinCam("rail", 1, settleAt, rest);
    expect(early.zoom).toBeGreaterThan(1);
    expect(early.panX).toBe(0);
    const close = spinCam("rail", settleAt + 0.3, settleAt, rest);
    expect(close.zoom).toBeGreaterThan(early.zoom);
    const p = ballPose(rest);
    // pan moves the resting ball toward the centre of the shot
    expect(Math.sign(close.panX)).toBe(Math.sign(C - p.x) || 0);
    expect(Math.sign(close.panY)).toBe(Math.sign(C - p.y) || 0);
  });
  it("offers seated / standing / bird's-eye views and three speeds", () => {
    expect(VIEWS.map((v) => v.id)).toEqual(["rail", "overhead", "bird"]);
    expect(SPEEDS.map((v) => v.id)).toEqual(["regular", "fast", "instant"]);
  });
});

describe("page wiring", () => {
  const page = readFileSync("src/app/roulette/page.tsx", "utf8");
  const wheel = readFileSync("src/components/RouletteWheel3D.tsx", "utf8");
  const geo = readFileSync("src/lib/games/wheel3d.ts", "utf8");
  it("plans the ball only from the server's returned pocket", () => {
    expect(page).toContain("planSpin(d.spin.pocket,");
    expect(page).toContain("planSpin(d.last.pocket,");
    expect(page.match(/planSpin\(/g)).toHaveLength(2);
    expect(page).toMatch(/<RouletteWheel3D pocket=\{displayPocket\}/);
  });
  it("the wheel and its geometry have no randomness of their own", () => {
    expect(wheel).not.toMatch(/Math\.random|crypto\./);
    expect(geo).not.toMatch(/Math\.random|crypto\./);
  });
  it("keeps sandbox labels and honest-odds copy on the table", () => {
    expect(page).toContain("Sandbox chips · 21+");
    expect(page).toContain("house edge 5.26% on every bet");
    expect(page).toContain("The server picks every result before the ball is shown");
  });
  it("respects reduced motion", () => {
    expect(page).toMatch(/const instant = reduced \|\| skipped \|\| speed === "instant"/);
    expect(readFileSync("src/app/roulette3d.css", "utf8")).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});
