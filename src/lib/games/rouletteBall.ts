/**
 * Cosmetic roulette ball physics. The server has already picked the pocket;
 * this only builds an animation that ends there.
 *
 * Angles are degrees clockwise from the top (the pointer), radii are in the
 * wheel's 440-unit SVG space. Pocket i on the rotor spans
 * [rotor + i*slice, rotor + (i+1)*slice).
 *
 * How it lands on the result without snapping: the whole run is a plain
 * forward simulation (friction, rim drop, diamond deflectors, fret bounces,
 * settling). We try seeded launches until one simulation naturally ends in
 * the target pocket, then play that run back frame by frame. Nothing is
 * corrected after the fact, so every frame is physically continuous.
 */
import { WHEEL_ORDER } from "./rouletteFelt";

export const N_POCKETS = WHEEL_ORDER.length;
export const SLICE = 360 / N_POCKETS;
export const R_TRACK = 197; // ball track groove
export const R_DEFLECT = 178; // diamond ring
export const R_POCKET_TOP = 120; // where the ball meets the frets
export const R_REST = 100; // pocket floor
export const DIAMONDS = Array.from({ length: 8 }, (_, i) => i * 45 + 22.5);
export const FPS = 60;
const DT = 1 / 240;
const STEPS_PER_FRAME = 240 / FPS;

export type Frame = { rotor: number; ball: number; r: number; lift: number };
export type Phase = "track" | "fall" | "rattle" | "settled";
export type SpinPlan = {
  pocket: string;
  seed: number;
  frames: Frame[];
  durationMs: number;
  /** Frame index where each phase starts, for tests and debugging. */
  phaseAt: Record<Phase, number>;
  maxBallStepDeg: number;
};

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mod = (x: number, m: number) => ((x % m) + m) % m;

export function pocketAt(ball: number, rotor: number): string {
  return WHEEL_ORDER[Math.floor(mod(ball - rotor, 360) / SLICE) % N_POCKETS]!;
}

/** Shortest signed angular distance a→b in degrees. */
export function angDiff(a: number, b: number) {
  return mod(b - a + 180, 360) - 180;
}

type Sim = { frames: Frame[]; phaseAt: Record<Phase, number>; pocket: string; maxStep: number };

/** One forward simulation. Deterministic for a given (seed, rotor0, turbo). */
export function simulate(seed: number, rotor0: number, turbo = false): Sim {
  const rnd = mulberry32(seed);
  let rotor = rotor0;
  let wr = 34 + rnd() * 14; // rotor deg/s, clockwise
  const wrDecay = 0.035;
  let theta = rnd() * 360; // ball launched anywhere on the track
  // Ball counter-rotates. Turbo launches it slower so it reaches the drop sooner.
  let w = -(turbo ? 390 + rnd() * 50 : 860 + rnd() * 140);
  let r = R_TRACK;
  let vr = 0;
  let lift = 0; // visual hop height while rattling
  let vLift = 0;
  let phase: Phase = "track";
  const phaseAt: Record<Phase, number> = { track: 0, fall: -1, rattle: -1, settled: -1 };
  const frames: Frame[] = [];
  const dropW = 300 + rnd() * 40;
  let rel = 0; // ball angle in rotor frame while rattling
  let wrel = 0;
  let settleT = 0;
  let restCenter = 0;
  const hitCool = new Map<number, number>();
  let maxStep = 0;
  let last: Frame | null = null;

  for (let step = 0; step < 240 * 20; step++) {
    // rotor: gentle bearing friction
    wr -= wr * wrDecay * DT;
    rotor += wr * DT;

    if (phase === "track") {
      // rolling + air friction against the wall
      const dec = 38 + 0.00042 * w * w;
      w += dec * DT; // w is negative, friction pushes toward 0
      theta += w * DT;
      if (-w < dropW) {
        phase = "fall";
        phaseAt.fall = frames.length;
        vr = -10;
      }
    } else if (phase === "fall") {
      // centripetal support fades as it slows; it spirals down the cone
      const support = Math.min(1, (w * w) / (dropW * dropW));
      vr += (-520 * (1 - 0.7 * support)) * DT;
      vr *= 1 - 0.6 * DT;
      r += vr * DT;
      const dec = 70 + 0.0003 * w * w;
      w += dec * DT;
      if (w > -130) w = -130;
      theta += w * DT;
      // diamonds / deflectors on the stator
      if (Math.abs(r - R_DEFLECT) < 4 && vr < 0) {
        for (let d = 0; d < DIAMONDS.length; d++) {
          const cool = hitCool.get(d) ?? 0;
          if (step < cool) continue;
          if (Math.abs(angDiff(theta, DIAMONDS[d]!)) < 3.2) {
            hitCool.set(d, step + 60);
            vr = Math.abs(vr) * (0.25 + rnd() * 0.3) + 20 * rnd();
            w *= 0.55 + rnd() * 0.3;
            if (rnd() < 0.25) w = -w * 0.3; // occasional kick back
            vLift = 90 + rnd() * 80;
          }
        }
      }
      if (r <= R_POCKETTOP()) {
        phase = "rattle";
        phaseAt.rattle = frames.length;
        rel = theta - rotor;
        wrel = w - wr;
        vr = -Math.abs(vr) * 0.6;
      }
    } else if (phase === "rattle" || phase === "settled") {
      // inward toward the pocket floor, bounces off it
      if (r > R_REST) {
        vr += -400 * DT;
        r += vr * DT;
        if (r < R_REST) {
          r = R_REST;
          vr = Math.abs(vr) * 0.3;
          if (vr < 8) vr = 0;
        }
      }
      // friction in rotor frame
      const sgn = Math.sign(wrel);
      const fr = (phase === "settled" ? 0 : 75) * DT;
      if (Math.abs(wrel) <= fr) wrel = 0;
      else wrel -= sgn * fr;
      const prev = rel;
      rel += wrel * DT;
      // fret crossing
      const cellPrev = Math.floor(mod(prev, 360) / SLICE);
      const cellNow = Math.floor(mod(rel, 360) / SLICE);
      if (cellPrev !== cellNow && phase === "rattle") {
        if (Math.abs(wrel) > 45 && rnd() < 0.85) {
          // hops the fret into the next pocket, loses energy
          wrel *= 0.72 + rnd() * 0.18;
          vLift = 60 + Math.abs(wrel) * 0.4;
          if (rnd() < 0.15) wrel = -wrel * 0.6;
        } else {
          // strikes the fret and bounces back
          rel = prev;
          wrel = -wrel * (0.35 + rnd() * 0.15);
          vLift = 30 + Math.abs(wrel) * 0.3;
        }
      }
      if (phase === "rattle" && Math.abs(wrel) < 7 && r <= R_REST + 0.5 && lift < 0.5) {
        settleT += DT;
        if (settleT > 0.12) {
          phase = "settled";
          phaseAt.settled = frames.length;
          restCenter = (Math.floor(rel / SLICE) + 0.5) * SLICE;
        }
      }
      if (phase === "settled") {
        // rolls to the bottom of the pocket: damped spring in rotor frame
        wrel += -(rel - restCenter) * 130 * DT;
        wrel *= 1 - 10 * DT;
      }
      theta = rotor + rel;
    }

    // visual hop
    if (lift > 0 || vLift > 0) {
      vLift -= 900 * DT;
      lift += vLift * DT;
      if (lift <= 0) { lift = 0; vLift = 0; }
    }

    if (step % STEPS_PER_FRAME === 0) {
      const f = { rotor, ball: theta, r, lift };
      if (last) maxStep = Math.max(maxStep, Math.abs(f.ball - last.ball));
      frames.push(f);
      last = f;
      if (phase === "settled" && frames.length - phaseAt.settled > FPS * (turbo ? 0.35 : 0.7)) break;
    }
  }
  return { frames, phaseAt, pocket: pocketAt(theta, rotor), maxStep };
}
function R_POCKETTOP() { return R_POCKET_TOP; }

/** Find a seeded run that naturally finishes in `pocket`. */
export function planSpin(pocket: string, rotor0: number, opts: { turbo?: boolean; seed?: number } = {}): SpinPlan {
  if (!WHEEL_ORDER.includes(pocket as never)) throw new Error(`unknown pocket ${pocket}`);
  const base = (opts.seed ?? Math.floor(Math.random() * 1e9)) >>> 0;
  for (let k = 0; k < 4000; k++) {
    const seed = (base + k * 2654435761) >>> 0;
    const s = simulate(seed, rotor0, !!opts.turbo);
    if (s.phaseAt.settled < 0 || s.pocket !== pocket) continue;
    return {
      pocket, seed, frames: s.frames, phaseAt: s.phaseAt,
      durationMs: Math.round((s.frames.length / FPS) * 1000), maxBallStepDeg: s.maxStep,
    };
  }
  throw new Error("no trajectory found");
}

/** Resting frame for skip / reduced motion: ball centred in the pocket at the pointer-free rest angle. */
export function settledFrame(plan: SpinPlan): Frame {
  return plan.frames[plan.frames.length - 1]!;
}
