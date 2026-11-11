"use client";
/**
 * 3D roulette wheel: layered CSS-3D planes (raised wooden bowl, sloped cone,
 * recessed pockets, raised gold frets and turret) under a moving camera.
 * The ball replays a precomputed physics plan that already ends in the server's
 * pocket; this component never picks or alters a result.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { FPS, DIAMONDS, R_DEFLECT, type Frame, type SpinPlan } from "@/lib/games/rouletteBall";
import { WHEEL_ORDER as WHEEL, pocketColor } from "@/lib/games/rouletteFelt";
import {
  C, R, Z, BALL_R, ballPose, ballTransform, baseCam, camTransform, spinCam, type Cam, type View,
} from "@/lib/games/wheel3d";

const N = WHEEL.length;
const SL = 360 / N;
const rad = (d: number) => ((d - 90) * Math.PI) / 180; // clockwise-from-top -> SVG angle
const pt = (r: number, d: number) => [C + r * Math.cos(rad(d)), C + r * Math.sin(rad(d))] as const;
function sector(r0: number, r1: number, d0: number, d1: number) {
  const [a, b] = pt(r0, d0), [c, d] = pt(r1, d0), [e, f] = pt(r1, d1), [g, h] = pt(r0, d1);
  const L = d1 - d0 > 180 ? 1 : 0;
  return `M${a.toFixed(2)} ${b.toFixed(2)}L${c.toFixed(2)} ${d.toFixed(2)}A${r1} ${r1} 0 ${L} 1 ${e.toFixed(2)} ${f.toFixed(2)}L${g.toFixed(2)} ${h.toFixed(2)}A${r0} ${r0} 0 ${L} 0 ${a.toFixed(2)} ${b.toFixed(2)}Z`;
}
const SIDES = 9;

export default function RouletteWheel3D({
  pocket, spinning, plan, instant = false, view = "rail", reduced = false, call,
}: {
  pocket?: string | null;
  spinning?: boolean;
  plan?: SpinPlan | null;
  /** Skip / reduced motion / really-fast speed: jump to the settled frame. */
  instant?: boolean;
  view?: View;
  reduced?: boolean;
  /** Dealer call shown over the wheel ("No more bets", "17 Black"). */
  call?: string | null;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const planeRef = useRef<HTMLDivElement | null>(null);
  const rotorRef = useRef<HTMLDivElement | null>(null);
  const ballRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<HTMLDivElement | null>(null);
  const turretRef = useRef<HTMLDivElement | null>(null);
  const camRef = useRef<Cam>(baseCam(view));
  const frameRef = useRef<Frame | null>(null);
  const [k, setK] = useState(0.8);

  // Fit the fixed 440-unit scene to the available width.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => setK(Math.max(0.35, (el.clientWidth / 440) * 0.88)); // headroom for perspective + push-in
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const paint = () => {
    const c = camRef.current;
    if (planeRef.current) planeRef.current.style.transform = camTransform(c);
    if (turretRef.current) {
      turretRef.current.style.transform = `translateZ(${Z.arms - 2}px) rotateX(${(-c.tilt).toFixed(2)}deg)`;
      turretRef.current.style.opacity = String(Math.min(1, c.tilt / 24));
    }
    const f = frameRef.current;
    if (!f) return;
    if (rotorRef.current) rotorRef.current.style.transform = `rotateZ(${f.rotor.toFixed(3)}deg)`;
    const p = ballPose(f);
    if (ballRef.current) ballRef.current.style.transform = ballTransform(p, c.tilt);
    if (shadowRef.current) {
      const lift = p.z - p.shadowZ - BALL_R;
      shadowRef.current.style.transform = `translate3d(${(p.x - 9).toFixed(2)}px, ${(p.y - 6).toFixed(2)}px, ${p.shadowZ.toFixed(2)}px)`;
      shadowRef.current.style.opacity = Math.max(0.15, 0.6 - lift * 0.025).toFixed(2);
    }
  };

  // Tween the camera to a target (used for view changes and the settle pull-back).
  const tweenRef = useRef(0);
  const tweenTo = (target: Cam, ms: number, delay = 0) => {
    cancelAnimationFrame(tweenRef.current);
    if (ms <= 0 || reduced) { camRef.current = target; paint(); return; }
    const from = { ...camRef.current };
    const t0 = performance.now() + delay;
    const step = (now: number) => {
      const q = Math.min(1, Math.max(0, (now - t0) / ms));
      const e = q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
      camRef.current = {
        tilt: from.tilt + (target.tilt - from.tilt) * e,
        zoom: from.zoom + (target.zoom - from.zoom) * e,
        panX: from.panX + (target.panX - from.panX) * e,
        panY: from.panY + (target.panY - from.panY) * e,
      };
      paint();
      if (q < 1) tweenRef.current = requestAnimationFrame(step);
    };
    tweenRef.current = requestAnimationFrame(step);
  };

  // Spin playback: physics frames + camera push-in and pocket close-up.
  useEffect(() => {
    if (!plan) { paint(); return; }
    const frames = plan.frames;
    const last = frames[frames.length - 1]!;
    if (instant || !spinning) {
      frameRef.current = last;
      if (spinning || instant) { cancelAnimationFrame(tweenRef.current); camRef.current = baseCam(view); }
      paint();
      if (!spinning && !instant) tweenTo(baseCam(view), 900, 1500); // pull back after the close-up
      return () => cancelAnimationFrame(tweenRef.current);
    }
    cancelAnimationFrame(tweenRef.current);
    const settleAt = (plan.phaseAt.settled > 0 ? plan.phaseAt.settled : frames.length) / FPS;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      const i = Math.min(frames.length - 1, Math.floor(t * FPS));
      frameRef.current = frames[i]!;
      camRef.current = spinCam(view, t, settleAt, last, reduced);
      paint();
      if (i < frames.length - 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, instant, spinning]);

  // View change while idle: glide to the new seat.
  useEffect(() => {
    if (spinning) return;
    tweenTo(baseCam(view), 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  useEffect(() => () => cancelAnimationFrame(tweenRef.current), []);

  const settled = !spinning && !!pocket && !!plan;

  return (
    <div className={`rw3d view-${view}${spinning ? " spinning" : ""}${settled ? " settled" : ""}`} ref={boxRef}>
      <div className="rw3d-fit" style={{ transform: `translate(-50%, -50%) scale(${k.toFixed(4)})` }}>
        <div className="rw3d-cam">
          <div className="rw3d-plane" ref={planeRef} style={{ transform: camTransform(camRef.current) }}>
            <div className="rw3d-floor" />
            {Array.from({ length: SIDES }, (_, i) => (
              <div key={i} className="rw3d-side" style={{ transform: `translateZ(${-14 - i * 2.4}px)` }} />
            ))}
            {/* Bowl: ball track, sloped cone, deflector diamonds */}
            <svg className="rw3d-layer" viewBox="0 0 440 440" style={{ transform: `translateZ(${Z.track}px)` }} aria-hidden>
              <defs>
                <radialGradient id={`trk${uid}`} cx={C} cy={C} r={R.trackOut} gradientUnits="userSpaceOnUse">
                  <stop offset="68%" stopColor="#3a0e08" />
                  <stop offset="80%" stopColor="#5a1a0e" />
                  <stop offset="88%" stopColor="#8a2a14" />
                  <stop offset="93%" stopColor="#4a1208" />
                  <stop offset="100%" stopColor="#2a0804" />
                </radialGradient>
                <linearGradient id={`sheen${uid}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="rgba(255,220,180,.32)" />
                  <stop offset="40%" stopColor="rgba(255,220,180,0)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,.35)" />
                </linearGradient>
                <linearGradient id={`au${uid}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#fff6c4" /><stop offset="45%" stopColor="#f0c040" /><stop offset="100%" stopColor="#8a5a0c" />
                </linearGradient>
              </defs>
              <circle cx={C} cy={C} r={(R.trackOut + R.coneIn) / 2} fill="none" stroke={`url(#trk${uid})`} strokeWidth={R.trackOut - R.coneIn} />
              <circle cx={C} cy={C} r={(R.trackOut + R.coneIn) / 2} fill="none" stroke={`url(#sheen${uid})`} strokeWidth={R.trackOut - R.coneIn} />
              <circle cx={C} cy={C} r={R.trackIn} fill="none" stroke="#e0a52a" strokeWidth="1.4" opacity=".75" />
              <circle cx={C} cy={C} r={R.coneIn + 1} fill="none" stroke="rgba(0,0,0,.55)" strokeWidth="3" />
              {Array.from({ length: 8 }, (_, i) => {
                const [x1, y1] = pt(R.coneIn, i * 45), [x2, y2] = pt(R.trackIn, i * 45);
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e0a52a" strokeWidth="1" opacity=".5" />;
              })}
            </svg>
            <svg className="rw3d-layer" viewBox="0 0 440 440" style={{ transform: "translateZ(2px)" }} aria-hidden>
              {DIAMONDS.map((d) => {
                const [x, y] = pt(R_DEFLECT, d);
                return <polygon key={d} points="0,-8 3.6,0 0,8 -3.6,0" transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${d})`} fill={`url(#au${uid})`} stroke="#5a3a06" strokeWidth=".8" />;
              })}
            </svg>
            {/* Raised wooden rim: stacked rings give it a real wall */}
            {[2, 4, 6].map((z) => (
              <div key={z} className="rw3d-rimwall" style={{ transform: `translateZ(${z}px)` }} />
            ))}
            <svg className="rw3d-layer" viewBox="0 0 440 440" style={{ transform: `translateZ(${Z.rim}px)` }} aria-hidden>
              <defs>
                <linearGradient id={`rim${uid}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#c0402a" /><stop offset="30%" stopColor="#8a1a10" /><stop offset="70%" stopColor="#5a0c08" /><stop offset="100%" stopColor="#2a0402" />
                </linearGradient>
              </defs>
              <circle cx={C} cy={C} r={(R.rimOut + R.rimIn) / 2} fill="none" stroke={`url(#rim${uid})`} strokeWidth={R.rimOut - R.rimIn} />
              <circle cx={C} cy={C} r={R.rimIn + 1} fill="none" stroke={`url(#au${uid})`} strokeWidth="2.4" />
              <circle cx={C} cy={C} r={R.rimOut - 1.5} fill="none" stroke="rgba(255,210,150,.35)" strokeWidth="1.5" />
            </svg>

            {/* Rotor: everything that turns */}
            <div className="rw3d-rotor" ref={rotorRef}>
              <svg className="rw3d-layer" viewBox="0 0 440 440" style={{ transform: `translateZ(${Z.pocket}px)` }} aria-hidden>
                <defs>
                  <radialGradient id={`pk${uid}`} cx={C} cy={C} r={R.pocketOut} gradientUnits="userSpaceOnUse">
                    <stop offset="69%" stopColor="rgba(0,0,0,.4)" />
                    <stop offset="76%" stopColor="rgba(0,0,0,0)" />
                    <stop offset="90%" stopColor="rgba(255,255,255,.1)" />
                    <stop offset="100%" stopColor="rgba(0,0,0,.35)" />
                  </radialGradient>
                </defs>
                {WHEEL.map((p, i) => {
                  const col = pocketColor(p);
                  return (
                    <path key={p} d={sector(R.pocketIn, R.pocketOut, i * SL, (i + 1) * SL)}
                      className={`rw3d-pk ${col}${settled && p === pocket ? " win" : ""}`} />
                  );
                })}
                <circle cx={C} cy={C} r={R.pocketOut} fill={`url(#pk${uid})`} />
              </svg>
              <svg className="rw3d-layer" viewBox="0 0 440 440" style={{ transform: `translateZ(${Z.ring}px)` }} aria-hidden>
                {WHEEL.map((p, i) => {
                  const col = pocketColor(p);
                  const [tx, ty] = pt((R.ringIn + R.ringOut) / 2, i * SL + SL / 2);
                  return (
                    <g key={p}>
                      <path d={sector(R.ringIn, R.ringOut, i * SL, (i + 1) * SL)} className={`rw3d-ring ${col}`} />
                      <text x={tx.toFixed(2)} y={ty.toFixed(2)} className="rw3d-num" fontSize={p.length > 1 ? 11 : 12.5}
                        transform={`rotate(${i * SL + SL / 2} ${tx.toFixed(2)} ${ty.toFixed(2)})`}>{p}</text>
                    </g>
                  );
                })}
                <circle cx={C} cy={C} r={R.ringOut - 0.8} fill="none" stroke={`url(#au${uid})`} strokeWidth="2.2" />
                <circle cx={C} cy={C} r={R.ringIn} fill="none" stroke={`url(#au${uid})`} strokeWidth="1.6" />
              </svg>
              <svg className="rw3d-layer" viewBox="0 0 440 440" style={{ transform: `translateZ(${Z.frets}px)` }} aria-hidden>
                {WHEEL.map((p, i) => {
                  const [x1, y1] = pt(R.pocketIn, i * SL), [x2, y2] = pt(R.pocketOut, i * SL);
                  return <line key={p} x1={x1.toFixed(2)} y1={y1.toFixed(2)} x2={x2.toFixed(2)} y2={y2.toFixed(2)} stroke={`url(#au${uid})`} strokeWidth="2.2" strokeLinecap="round" />;
                })}
              </svg>
              {/* Turret dome with spokes */}
              <svg className="rw3d-layer" viewBox="0 0 440 440" style={{ transform: "translateZ(-6px)" }} aria-hidden>
                <defs>
                  <radialGradient id={`dome${uid}`} cx="42%" cy="38%" r="62%">
                    <stop offset="0%" stopColor="#c0402a" /><stop offset="45%" stopColor="#7a160c" /><stop offset="100%" stopColor="#2a0402" />
                  </radialGradient>
                </defs>
                <circle cx={C} cy={C} r={R.dome} fill={`url(#dome${uid})`} stroke={`url(#au${uid})`} strokeWidth="3" />
                {Array.from({ length: 8 }, (_, i) => {
                  const [x1, y1] = pt(26, i * 45 + 22.5), [x2, y2] = pt(R.dome - 4, i * 45 + 22.5);
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e0a52a" strokeWidth="1.2" opacity=".7" />;
                })}
              </svg>
              {/* Turret cross arms, raised above the dome */}
              <svg className="rw3d-layer" viewBox="0 0 440 440" style={{ transform: `translateZ(${Z.arms}px)` }} aria-hidden>
                {[0, 90, 180, 270].map((d) => {
                  const [x2, y2] = pt(58, d);
                  const [xk, yk] = pt(62, d);
                  return (
                    <g key={d}>
                      <line x1={C} y1={C} x2={x2} y2={y2} stroke="#5a3a06" strokeWidth="7.5" strokeLinecap="round" />
                      <line x1={C} y1={C} x2={x2} y2={y2} stroke={`url(#au${uid})`} strokeWidth="5.5" strokeLinecap="round" />
                      <circle cx={xk} cy={yk} r="6" fill={`url(#au${uid})`} stroke="#5a3a06" strokeWidth="1" />
                    </g>
                  );
                })}
                <circle cx={C} cy={C} r="20" fill={`url(#au${uid})`} stroke="#5a3a06" strokeWidth="1.2" />
                <circle cx={C - 5} cy={C - 6} r="6" fill="rgba(255,255,240,.6)" />
              </svg>
            </div>

            {/* Upright turret spindle (always faces the camera) */}
            <div className="rw3d-turret" ref={turretRef} aria-hidden>
              <svg viewBox="0 0 40 70" width="40" height="70">
                <ellipse cx="20" cy="64" rx="15" ry="5" fill={`url(#au${uid})`} />
                <path d="M14 63 C14 50 17 44 18 34 L22 34 C23 44 26 50 26 63 Z" fill={`url(#au${uid})`} stroke="#5a3a06" strokeWidth=".8" />
                <ellipse cx="20" cy="33" rx="7" ry="2.6" fill="#8a5a0c" />
                <circle cx="20" cy="22" r="10" fill={`url(#au${uid})`} stroke="#5a3a06" strokeWidth=".8" />
                <circle cx="16.5" cy="18.5" r="3.4" fill="rgba(255,255,240,.75)" />
                <circle cx="20" cy="8" r="4" fill={`url(#au${uid})`} stroke="#5a3a06" strokeWidth=".6" />
              </svg>
            </div>

            <div className="rw3d-shadow" ref={shadowRef} style={{ visibility: plan ? "visible" : "hidden" }} />
            <div className="rw3d-ball" ref={ballRef} style={{ visibility: plan ? "visible" : "hidden" }} />
          </div>
        </div>
      </div>
      {call && <div className={`rw3d-call${settled ? " result " + (pocket ? pocketColor(pocket) : "") : ""}`} aria-hidden>{call}</div>}
    </div>
  );
}
