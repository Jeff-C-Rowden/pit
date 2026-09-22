"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { VS_SYMBOLS, type VsSymbol } from "@/lib/games/slotProgressive";

const VISIBLE = 3;
const FILLER_LEN = 28;
const STOP_MS = [2400, 3000, 3600, 4200, 4800] as const;

function useSymHeight() {
  const [h, setH] = useState(92);
  useEffect(() => {
    const sync = () => {
      const w = window.innerWidth;
      if (w <= 380) setH(64);
      else if (w <= 720) setH(76);
      else setH(92);
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);
  return h;
}

const SymHCtx = createContext(92);

export type WinCell = { reel: number; row: number };

function SvgWild() {
  const id = useId().replace(/:/g, "");
  const g = `csw-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff4c8" />
          <stop offset="50%" stopColor="#e0a820" />
          <stop offset="100%" stopColor="#6a4010" />
        </linearGradient>
      </defs>
      {/* Original tribal idol / mask — not licensed IP */}
      <ellipse cx="32" cy="34" rx="18" ry="22" fill={`url(#${g})`} stroke="#3a2808" strokeWidth="1.5" />
      <path d="M22 18 Q32 8 42 18" fill="none" stroke="#3a2808" strokeWidth="2" />
      <circle cx="25" cy="30" r="3.5" fill="#1a1004" />
      <circle cx="39" cy="30" r="3.5" fill="#1a1004" />
      <path d="M26 42 Q32 48 38 42" fill="none" stroke="#1a1004" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="29" y="6" width="6" height="10" rx="1" fill={`url(#${g})`} stroke="#3a2808" strokeWidth="1" />
    </svg>
  );
}

function SvgMonkey() {
  const id = useId().replace(/:/g, "");
  const g = `csm-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d4a070" />
          <stop offset="55%" stopColor="#8a5830" />
          <stop offset="100%" stopColor="#3a2010" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="28" r="8" fill={`url(#${g})`} stroke="#2a1808" strokeWidth="1.2" />
      <circle cx="48" cy="28" r="8" fill={`url(#${g})`} stroke="#2a1808" strokeWidth="1.2" />
      <ellipse cx="32" cy="34" rx="16" ry="18" fill={`url(#${g})`} stroke="#2a1808" strokeWidth="1.4" />
      <ellipse cx="32" cy="38" rx="10" ry="9" fill="#f0d0a8" />
      <circle cx="26" cy="30" r="2.8" fill="#1a1008" />
      <circle cx="38" cy="30" r="2.8" fill="#1a1008" />
      <ellipse cx="32" cy="40" rx="3" ry="2.2" fill="#5a3020" />
      <path d="M28 46 Q32 49 36 46" fill="none" stroke="#5a3020" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SvgParrot() {
  const id = useId().replace(/:/g, "");
  const g = `csp-${id}`;
  const g2 = `csp2-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dff9a" />
          <stop offset="50%" stopColor="#1a8848" />
          <stop offset="100%" stopColor="#0a4028" />
        </linearGradient>
        <linearGradient id={g2} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffd060" />
          <stop offset="100%" stopColor="#e05020" />
        </linearGradient>
      </defs>
      <ellipse cx="30" cy="34" rx="14" ry="18" fill={`url(#${g})`} stroke="#083020" strokeWidth="1.3" />
      <path d="M40 28 Q54 24 52 36 Q48 40 40 36 Z" fill={`url(#${g2})`} stroke="#6a2808" strokeWidth="1.1" />
      <circle cx="26" cy="28" r="3" fill="#f8f0e0" />
      <circle cx="26" cy="28" r="1.5" fill="#101008" />
      <path d="M22 48 Q28 56 36 50" fill="none" stroke="#e05020" strokeWidth="3" strokeLinecap="round" />
      <path d="M18 20 Q24 8 32 16" fill="none" stroke="#2a90d0" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function SvgJaguar() {
  const id = useId().replace(/:/g, "");
  const g = `csj-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0c860" />
          <stop offset="50%" stopColor="#c88820" />
          <stop offset="100%" stopColor="#5a3810" />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="34" rx="20" ry="16" fill={`url(#${g})`} stroke="#3a2408" strokeWidth="1.4" />
      <circle cx="14" cy="22" r="6" fill={`url(#${g})`} stroke="#3a2408" strokeWidth="1.2" />
      <circle cx="50" cy="22" r="6" fill={`url(#${g})`} stroke="#3a2408" strokeWidth="1.2" />
      <circle cx="24" cy="32" r="3" fill="#1a1004" />
      <circle cx="40" cy="32" r="3" fill="#1a1004" />
      <ellipse cx="32" cy="40" rx="5" ry="3.5" fill="#2a1808" />
      <circle cx="20" cy="40" r="2.2" fill="#2a1808" />
      <circle cx="44" cy="40" r="2.2" fill="#2a1808" />
      <circle cx="28" cy="24" r="1.6" fill="#2a1808" />
      <circle cx="36" cy="26" r="1.6" fill="#2a1808" />
      <circle cx="32" cy="48" r="1.8" fill="#2a1808" />
    </svg>
  );
}

function SvgToucan() {
  const id = useId().replace(/:/g, "");
  const g = `cst-${id}`;
  const g2 = `cst2-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#404850" />
          <stop offset="100%" stopColor="#101418" />
        </linearGradient>
        <linearGradient id={g2} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffe060" />
          <stop offset="55%" stopColor="#f08020" />
          <stop offset="100%" stopColor="#d02040" />
        </linearGradient>
      </defs>
      <ellipse cx="28" cy="36" rx="12" ry="16" fill={`url(#${g})`} stroke="#080a0c" strokeWidth="1.3" />
      <path d="M36 28 Q58 22 56 36 Q54 44 36 40 Z" fill={`url(#${g2})`} stroke="#6a2008" strokeWidth="1.2" />
      <circle cx="24" cy="30" r="3.2" fill="#f8f4e8" />
      <circle cx="24" cy="30" r="1.6" fill="#101008" />
      <path d="M20 48 Q26 56 34 50" fill="none" stroke="#e8c040" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function SvgBanana() {
  const id = useId().replace(/:/g, "");
  const g = `csb-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff6a0" />
          <stop offset="45%" stopColor="#f0c028" />
          <stop offset="100%" stopColor="#8a6810" />
        </linearGradient>
      </defs>
      <path
        d="M22 14 Q18 28 22 46 Q28 54 38 50 Q44 40 42 24 Q38 14 28 12 Q24 12 22 14 Z"
        fill={`url(#${g})`}
        stroke="#5a4010"
        strokeWidth="1.4"
      />
      <path d="M28 16 Q30 30 32 46" fill="none" stroke="#c89820" strokeWidth="1.2" opacity=".7" />
      <ellipse cx="26" cy="12" rx="3" ry="2" fill="#6a8830" stroke="#3a5020" strokeWidth="0.8" />
    </svg>
  );
}

function SvgCoconut() {
  const id = useId().replace(/:/g, "");
  const g = `csc-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c8a078" />
          <stop offset="50%" stopColor="#6a4830" />
          <stop offset="100%" stopColor="#2a1810" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="34" r="20" fill={`url(#${g})`} stroke="#1a1008" strokeWidth="1.5" />
      <circle cx="26" cy="30" r="2" fill="#1a1008" />
      <circle cx="34" cy="28" r="2" fill="#1a1008" />
      <circle cx="30" cy="38" r="2" fill="#1a1008" />
      <path d="M18 22 Q32 16 46 24" fill="none" stroke="#d8b890" strokeWidth="1.2" opacity=".5" />
    </svg>
  );
}

function SvgVine() {
  const id = useId().replace(/:/g, "");
  const g = `csv-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b8f080" />
          <stop offset="50%" stopColor="#3a9840" />
          <stop offset="100%" stopColor="#144820" />
        </linearGradient>
      </defs>
      <path
        d="M18 50 Q22 28 32 22 Q42 16 48 10"
        fill="none"
        stroke={`url(#${g})`}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <ellipse cx="28" cy="28" rx="8" ry="5" transform="rotate(-35 28 28)" fill={`url(#${g})`} stroke="#0a3018" strokeWidth="1" />
      <ellipse cx="38" cy="18" rx="7" ry="4.5" transform="rotate(-20 38 18)" fill={`url(#${g})`} stroke="#0a3018" strokeWidth="1" />
      <ellipse cx="22" cy="40" rx="7" ry="4" transform="rotate(-50 22 40)" fill={`url(#${g})`} stroke="#0a3018" strokeWidth="1" />
    </svg>
  );
}

type ArtMeta = { label: string; tone: string; Svg: () => ReactNode };

export const VS_SYM_ART: Record<VsSymbol, ArtMeta> = {
  WILD: { label: "WILD", tone: "wild", Svg: SvgWild },
  MONKEY: { label: "MONKEY", tone: "monkey", Svg: SvgMonkey },
  PARROT: { label: "PARROT", tone: "parrot", Svg: SvgParrot },
  JAGUAR: { label: "JAGUAR", tone: "jaguar", Svg: SvgJaguar },
  TOUCAN: { label: "TOUCAN", tone: "toucan", Svg: SvgToucan },
  BANANA: { label: "BANANA", tone: "banana", Svg: SvgBanana },
  COCONUT: { label: "COCONUT", tone: "coconut", Svg: SvgCoconut },
  VINE: { label: "VINE", tone: "vine", Svg: SvgVine },
};

function randSym(): VsSymbol {
  return VS_SYMBOLS[Math.floor(Math.random() * VS_SYMBOLS.length)]!;
}

function fillerStrip(n: number): VsSymbol[] {
  return Array.from({ length: n }, () => randSym());
}

function SymTile({
  sym,
  spinning,
  win,
}: {
  sym: VsSymbol;
  spinning?: boolean;
  win?: boolean;
}) {
  const SYM_H = useContext(SymHCtx);
  const art = VS_SYM_ART[sym] ?? VS_SYM_ART.VINE;
  const Icon = art.Svg;
  return (
    <div
      className={`sym tone-${art.tone}${spinning ? " spinning" : ""}${win ? " win" : ""}`}
      style={{ height: SYM_H }}
      aria-label={sym}
    >
      <span className="sym-face">
        <span className="sym-icon" aria-hidden>
          <Icon />
        </span>
        <span className="sym-label">{art.label}</span>
      </span>
    </div>
  );
}

type ReelProps = {
  index: number;
  final: VsSymbol[] | null;
  spinning: boolean;
  settled: boolean;
  winRows: Set<number>;
  spinGen: number;
  onStopped: (index: number) => void;
};

function Reel({ index, final, spinning, settled, winRows, spinGen, onStopped }: ReelProps) {
  const SYM_H = useContext(SymHCtx);
  const [strip, setStrip] = useState<VsSymbol[]>(() => ["VINE", "COCONUT", "BANANA"]);
  const [offset, setOffset] = useState(0);
  const [blur, setBlur] = useState(false);
  const [transitionMs, setTransitionMs] = useState(0);
  const [landed, setLanded] = useState(true);
  const [earlyTick, setEarlyTick] = useState(0);
  const stoppedForGen = useRef(-1);
  const wantEarly = useRef(false);
  const cycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onStoppedRef = useRef(onStopped);
  onStoppedRef.current = onStopped;

  const clearCycle = () => {
    if (cycleRef.current) {
      clearInterval(cycleRef.current);
      cycleRef.current = null;
    }
  };

  const markLanded = (syms: VsSymbol[]) => {
    if (stoppedForGen.current === spinGen) return;
    clearCycle();
    setBlur(false);
    setStrip(syms);
    setOffset(0);
    setTransitionMs(0);
    stoppedForGen.current = spinGen;
    setLanded(true);
    onStoppedRef.current(index);
  };

  useEffect(() => {
    if (spinning) return;
    wantEarly.current = false;
    setLanded(true);
    if (final && final.length === 3) {
      setStrip(final);
      setOffset(0);
      setBlur(false);
      setTransitionMs(0);
    }
  }, [spinning, final]);

  useEffect(() => {
    if (!spinning) {
      clearCycle();
      return;
    }
    wantEarly.current = false;
    stoppedForGen.current = -1;
    setLanded(false);
    setBlur(true);
    setTransitionMs(0);
    setStrip(fillerStrip(FILLER_LEN));
    setOffset(0);
    cycleRef.current = setInterval(() => {
      setStrip(fillerStrip(FILLER_LEN));
      setOffset(-(Math.floor(Math.random() * 5) * SYM_H));
    }, 85);
    return clearCycle;
  }, [spinning, spinGen, SYM_H]);

  useEffect(() => {
    if (!spinning || !final || final.length !== 3) return;
    if (stoppedForGen.current === spinGen) return;

    if (wantEarly.current) {
      wantEarly.current = false;
      markLanded(final);
      return;
    }

    clearCycle();
    const lead = fillerStrip(FILLER_LEN);
    const next = [...lead, ...final];
    setStrip(next);
    setOffset(0);
    setBlur(true);
    setTransitionMs(0);
    const target = -((next.length - VISIBLE) * SYM_H);
    const duration = STOP_MS[index] ?? 4800;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setTransitionMs(duration);
        setOffset(target);
      });
    });
    const t = window.setTimeout(() => {
      markLanded(final);
    }, duration + 48);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(t);
    };
    // earlyTick re-runs this effect so a mid-anim tap can snap immediately
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markLanded closes over spinGen/index
  }, [spinning, final, index, spinGen, SYM_H, earlyTick]);

  const interactive = spinning && !landed;

  const requestEarlyStop = () => {
    if (!interactive) return;
    wantEarly.current = true;
    setEarlyTick((n) => n + 1);
  };

  return (
    <div
      className={`reel${blur ? " is-spinning" : ""}${interactive ? " reel-tap-stop" : ""}`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={
        interactive
          ? `Reel ${index + 1}, tap to stop`
          : `Reel ${index + 1}`
      }
      title={interactive ? "Tap to stop" : undefined}
      onClick={interactive ? requestEarlyStop : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                requestEarlyStop();
              }
            }
          : undefined
      }
    >
      <div
        className="reel-strip"
        style={{
          transform: `translate3d(0, ${offset}px, 0)`,
          transition: transitionMs > 0 ? `transform ${transitionMs}ms cubic-bezier(0.12, 0.75, 0.18, 1)` : "none",
        }}
      >
        {strip.map((sym, i) => {
          const win = settled && !blur && strip.length === VISIBLE && winRows.has(i);
          return (
            <SymTile key={`${spinGen}-${i}-${sym}-${strip.length}`} sym={sym} spinning={blur} win={win} />
          );
        })}
      </div>
      {interactive && (
        <span className="reel-tap-hint" aria-hidden>
          Tap
        </span>
      )}
    </div>
  );
}

const IDLE: VsSymbol[][] = [
  ["VINE", "COCONUT", "BANANA"],
  ["TOUCAN", "PARROT", "VINE"],
  ["COCONUT", "JAGUAR", "TOUCAN"],
  ["PARROT", "VINE", "BANANA"],
  ["BANANA", "COCONUT", "MONKEY"],
];

export type VaultTheme = {
  title?: string;
  kickLabels?: [string, string, string];
  /** Extra class on cabinet root for CSS theme hooks */
  cabinetClass?: string;
};

const DEFAULT_THEME: Required<VaultTheme> = {
  title: "Canopy Spire",
  kickLabels: ["9 LINES", "JUNGLE", "PROGRESSIVE"],
  cabinetClass: "vault-cabinet",
};

/**
 * Canopy Spire cabinet (jungle progressive). Extension point: `theme` props for redesign
 * without forking spin math.
 */
export default function VaultSpireMachine({
  grid,
  spinning,
  winCells,
  onSpinComplete,
  theme,
}: {
  grid: VsSymbol[][] | null;
  spinning: boolean;
  winCells?: WinCell[];
  onSpinComplete?: () => void;
  theme?: VaultTheme;
}) {
  const t = { ...DEFAULT_THEME, ...theme, kickLabels: theme?.kickLabels ?? DEFAULT_THEME.kickLabels };
  const symH = useSymHeight();
  const [spinGen, setSpinGen] = useState(0);
  const [settled, setSettled] = useState(true);
  const stopped = useRef<Set<number>>(new Set());
  const completedGen = useRef(-1);
  const completeRef = useRef(onSpinComplete);
  completeRef.current = onSpinComplete;
  const genRef = useRef(spinGen);
  genRef.current = spinGen;

  useEffect(() => {
    if (!spinning) return;
    setSpinGen((g) => g + 1);
    setSettled(false);
    stopped.current = new Set();
  }, [spinning]);

  // Guarantee onSpinComplete even if a reel stop callback is missed
  useEffect(() => {
    if (!spinning || spinGen === 0) return;
    const g = spinGen;
    const ms = grid ? 7000 : 14000;
    const t = window.setTimeout(() => {
      if (completedGen.current === g) return;
      completedGen.current = g;
      setSettled(true);
      queueMicrotask(() => completeRef.current?.());
    }, ms);
    return () => window.clearTimeout(t);
  }, [spinning, spinGen, grid]);

  const onStopped = useCallback((index: number) => {
    stopped.current.add(index);
    if (stopped.current.size < 5) return;
    const g = genRef.current;
    if (completedGen.current === g) return;
    completedGen.current = g;
    setSettled(true);
    queueMicrotask(() => completeRef.current?.());
  }, []);

  const winByReel = useMemo(() => {
    const map: Set<number>[] = [new Set(), new Set(), new Set(), new Set(), new Set()];
    for (const c of winCells ?? []) {
      if (c.reel >= 0 && c.reel < 5) map[c.reel]!.add(c.row);
    }
    return map;
  }, [winCells]);

  return (
    <SymHCtx.Provider value={symH}>
      <div
        className={`slot-cabinet ${t.cabinetClass}`}
        style={{ ["--sym-h" as string]: `${symH}px` }}
        data-theme="vault-spire"
      >
        <div className="slot-lamp" aria-hidden />
        <div className="slot-top-lights" aria-hidden>
          <span /><span /><span /><span /><span /><span /><span />
        </div>
        <div className="slot-marquee">
          <span className="slot-marquee-gem" aria-hidden />
          <span className="slot-marquee-text">{t.title}</span>
          <span className="slot-marquee-gem" aria-hidden />
        </div>
        <div className="slot-body">
          <div className="slot-pillar slot-pillar-l" aria-hidden>
            <div className="slot-pillar-cap" />
            <div className="slot-pillar-shaft" />
            <div className="slot-pillar-base" />
          </div>
          <div className="slot-stage">
            <div className="slot-payline-marks" aria-hidden>
              <span className="plc top" /><span className="plc mid" /><span className="plc bot" />
            </div>
            <div className="slot-window" role="img" aria-label={`${t.title} reels`}>
              <div className="slot-glass" aria-hidden />
              {[0, 1, 2, 3, 4].map((r) => {
                let final: VsSymbol[] | null = null;
                if (grid?.[r]) final = grid[r]!;
                else if (!spinning) final = IDLE[r]!;
                return (
                  <Reel
                    key={r}
                    index={r}
                    final={final}
                    spinning={spinning}
                    settled={settled}
                    winRows={winByReel[r]!}
                    spinGen={spinGen}
                    onStopped={onStopped}
                  />
                );
              })}
            </div>
            <div className="slot-payline-marks right" aria-hidden>
              <span className="plc top" /><span className="plc mid" /><span className="plc bot" />
            </div>
          </div>
          <div className="slot-pillar slot-pillar-r" aria-hidden>
            <div className="slot-pillar-cap" />
            <div className="slot-pillar-shaft" />
            <div className="slot-pillar-base" />
          </div>
        </div>
        <div className="slot-rail" aria-hidden />
        <div className="slot-kickplate" aria-hidden>
          <span>{t.kickLabels[0]}</span>
          <span className="slot-kick-dot" />
          <span>{t.kickLabels[1]}</span>
          <span className="slot-kick-dot" />
          <span>{t.kickLabels[2]}</span>
        </div>
      </div>
    </SymHCtx.Provider>
  );
}
