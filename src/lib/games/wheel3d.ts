/**
 * Geometry + camera for the 3D roulette wheel. Pure, no DOM, no RNG.
 *
 * The wheel is drawn in a 440-unit plane (centre 220,220). Angles are degrees
 * clockwise from the top, matching rouletteBall.ts. The rotor layer is drawn with
 * pocket i spanning [i*SLICE, (i+1)*SLICE) and rotated by `rotor` degrees, so the
 * pocket under the ball is a pure function of the frame the server-driven plan
 * produced. Nothing here can choose or change a result.
 */
import { WHEEL_ORDER } from "./rouletteFelt";
import { SLICE, type Frame } from "./rouletteBall";

export const C = 220;
/** Radii of the drawn wheel (plane units). */
export const R = {
  rimOut: 220, rimIn: 204, // wooden bowl rim (raised)
  trackOut: 204, trackIn: 172, // ball track
  coneIn: 150, // stator cone with deflector diamonds (172..150)
  ringOut: 150, ringIn: 126, // number ring on the rotor
  pocketOut: 126, pocketIn: 88, // pockets (ball rests at R_REST = 100)
  dome: 88, // turret dome
} as const;
/** Surface heights (px, +z toward the camera) for the 3D layers. */
export const Z = { rim: 8, track: 0, cone: -4, ring: -7, pocket: -12, frets: -5, arms: 10 } as const;
export const BALL_R = 7.5;

const mod = (x: number, m: number) => ((x % m) + m) % m;
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

/** Height of the wheel surface under a given radius (cone slopes down toward the pockets). */
export function surfaceZ(r: number): number {
  if (r >= R.trackIn) return Z.track;
  if (r >= R.coneIn) return lerp(Z.cone, Z.track, (r - R.coneIn) / (R.trackIn - R.coneIn));
  if (r >= R.pocketOut) return lerp(Z.pocket, Z.cone, (r - R.pocketOut) / (R.coneIn - R.pocketOut) * 1.2);
  return Z.pocket;
}

export type BallPose = { x: number; y: number; z: number; shadowZ: number; scale: number };

/** Where the ball sits in the wheel plane for one physics frame. */
export function ballPose(f: Frame): BallPose {
  const a = (f.ball * Math.PI) / 180;
  const x = C + f.r * Math.sin(a);
  const y = C - f.r * Math.cos(a);
  const s = surfaceZ(f.r);
  const lift = Math.min(f.lift, 18);
  return { x, y, z: s + BALL_R + lift * 0.9, shadowZ: s + 0.6, scale: 1 + lift * 0.004 };
}

/**
 * Which drawn pocket the ball is in, computed only from the rendered geometry:
 * the ball's plane position and the rotor layer's rotation. Used by tests to prove
 * the picture shows exactly the server's pocket.
 */
export function drawnPocketUnderBall(f: Frame): string {
  const p = ballPose(f);
  const ang = mod((Math.atan2(p.x - C, -(p.y - C)) * 180) / Math.PI, 360); // clockwise from top
  const local = mod(ang - f.rotor, 360);
  return WHEEL_ORDER[Math.floor(local / SLICE) % WHEEL_ORDER.length]!;
}

/** Centre angle (clockwise from top, rotor frame) of a pocket as drawn. */
export function pocketCentreDeg(pocket: string): number {
  const i = WHEEL_ORDER.indexOf(pocket as never);
  if (i < 0) throw new Error(`unknown pocket ${pocket}`);
  return i * SLICE + SLICE / 2;
}

// ---------- Camera ----------
export type View = "rail" | "overhead" | "bird";
export type Speed = "regular" | "fast" | "instant";
export const VIEWS: { id: View; label: string; hint: string }[] = [
  { id: "rail", label: "Seated", hint: "Low seat at the rail, camera follows the ball" },
  { id: "overhead", label: "Standing", hint: "Higher look down at the table" },
  { id: "bird", label: "Bird's-eye", hint: "Straight down, no camera moves" },
];
export const SPEEDS: { id: Speed; label: string }[] = [
  { id: "regular", label: "Regular" }, { id: "fast", label: "Fast" }, { id: "instant", label: "Really fast" },
];
export type Cam = { tilt: number; zoom: number; panX: number; panY: number };
const BASE: Record<View, Cam> = {
  rail: { tilt: 56, zoom: 1, panX: 0, panY: 0 },
  overhead: { tilt: 32, zoom: 1, panX: 0, panY: 0 },
  bird: { tilt: 0, zoom: 1, panX: 0, panY: 0 },
};
export function baseCam(view: View): Cam { return { ...BASE[view] }; }

/**
 * Camera during a spin. `t` = seconds since launch, `settleAt` = seconds when the ball
 * comes to rest (from the plan), `rest` = the resting frame (for the close-up pan).
 * Bird's-eye and reduced motion never move the camera.
 */
export function spinCam(view: View, t: number, settleAt: number, rest: Frame | null, reduced = false): Cam {
  const b = baseCam(view);
  if (view === "bird" || reduced) return b;
  const ease = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
  // push in on the wheel as the ball is launched
  const push = ease(t / 0.8);
  let cam: Cam = { tilt: b.tilt + 6 * push, zoom: 1 + 0.1 * push, panX: 0, panY: 0 };
  // close-up on the pocket once the ball has dropped and is coming to rest
  if (rest && t > settleAt - 0.9) {
    const k = ease((t - (settleAt - 0.9)) / 1.1);
    const p = ballPose(rest);
    cam = {
      tilt: lerp(cam.tilt, b.tilt + 10, k),
      zoom: lerp(cam.zoom, 1.32, k),
      panX: lerp(0, (C - p.x) * 0.55, k),
      panY: lerp(0, (C - p.y) * 0.55, k),
    };
  }
  return cam;
}

export function camTransform(c: Cam): string {
  return `rotateX(${c.tilt.toFixed(2)}deg) scale(${c.zoom.toFixed(4)}) translate(${c.panX.toFixed(2)}px, ${c.panY.toFixed(2)}px)`;
}

/** Billboard transform for the ball (faces the camera at any tilt). */
export function ballTransform(p: BallPose, tilt: number): string {
  return `translate3d(${(p.x - BALL_R).toFixed(2)}px, ${(p.y - BALL_R).toFixed(2)}px, ${p.z.toFixed(2)}px) rotateX(${(-tilt).toFixed(2)}deg) scale(${p.scale.toFixed(3)})`;
}
