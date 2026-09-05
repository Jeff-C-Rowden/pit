"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { SYMBOLS, type Symbol } from "@/lib/games/slot";

const VISIBLE = 3;
const FILLER_LEN = 22;
const STOP_MS = [1200, 1400, 1600, 1800, 2000] as const;

/** Tile height must match CSS `.reel` / `.sym` — keep JS spin math in sync. */
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

function SvgCrown() {
  const id = useId().replace(/:/g, "");
  const g = `cg-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff6c0" />
          <stop offset="45%" stopColor="#f0c040" />
          <stop offset="100%" stopColor="#a86810" />
        </linearGradient>
      </defs>
      <path
        d="M8 44 L12 22 L24 36 L32 14 L40 36 L52 22 L56 44 Z"
        fill={`url(#${g})`}
        stroke="#6a4010"
        strokeWidth="1.5"
      />
      <rect x="10" y="44" width="44" height="8" rx="2" fill={`url(#${g})`} stroke="#6a4010" strokeWidth="1.2" />
      <circle cx="12" cy="22" r="3.2" fill="#ff5a6a" />
      <circle cx="32" cy="14" r="3.6" fill="#5ad0ff" />
      <circle cx="52" cy="22" r="3.2" fill="#7dff9a" />
    </svg>
  );
}

function SvgGem() {
  const id = useId().replace(/:/g, "");
  const g = `gg-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8fbff" />
          <stop offset="40%" stopColor="#4eb8ff" />
          <stop offset="100%" stopColor="#1848a8" />
        </linearGradient>
      </defs>
      <polygon points="32,6 52,22 42,54 22,54 12,22" fill={`url(#${g})`} stroke="#0e2a6a" strokeWidth="1.4" />
      <polygon points="32,6 42,22 22,22" fill="rgba(255,255,255,.55)" />
      <polygon points="22,22 32,54 12,22" fill="rgba(10,40,120,.35)" />
      <line x1="32" y1="6" x2="32" y2="54" stroke="rgba(255,255,255,.35)" strokeWidth="1" />
    </svg>
  );
}

function SvgHorse() {
  const id = useId().replace(/:/g, "");
  const g = `hg-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8d0b0" />
          <stop offset="50%" stopColor="#c05030" />
          <stop offset="100%" stopColor="#501408" />
        </linearGradient>
      </defs>
      <path
        d="M18 52 L22 34 L20 24 L28 16 L36 18 L42 12 L48 18 L46 28 L50 36 L44 42 L40 52 Z"
        fill={`url(#${g})`}
        stroke="#3a1008"
        strokeWidth="1.4"
      />
      <circle cx="34" cy="24" r="2.2" fill="#1a0804" />
      <path d="M42 12 L48 8 L50 14" fill="none" stroke="#f0a878" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SvgChip() {
  const id = useId().replace(/:/g, "");
  const g = `ch-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#b8ffe0" />
          <stop offset="45%" stopColor="#1f8a58" />
          <stop offset="100%" stopColor="#0a3020" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="24" fill={`url(#${g})`} stroke="#e8fff4" strokeWidth="2.5" />
      <circle cx="32" cy="32" r="14" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="2" strokeDasharray="5 4" />
      <circle cx="32" cy="32" r="8" fill="#0e4028" stroke="#9fe7c5" strokeWidth="1.2" />
      <text x="32" y="36" textAnchor="middle" fontSize="10" fontWeight="700" fill="#eafff6" fontFamily="system-ui">
        $
      </text>
    </svg>
  );
}

function SvgWild() {
  const id = useId().replace(/:/g, "");
  const g = `wg-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff8d0" />
          <stop offset="50%" stopColor="#ffd040" />
          <stop offset="100%" stopColor="#c87810" />
        </linearGradient>
      </defs>
      <polygon
        points="32,4 38,24 58,24 42,36 48,56 32,44 16,56 22,36 6,24 26,24"
        fill={`url(#${g})`}
        stroke="#6a4010"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="32" r="6" fill="#fff6c8" opacity=".85" />
    </svg>
  );
}

function SvgLamp() {
  const id = useId().replace(/:/g, "");
  const g = `lg-${id}`;
  const f = `lf-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff0b0" />
          <stop offset="50%" stopColor="#e0a820" />
          <stop offset="100%" stopColor="#7a5010" />
        </linearGradient>
        <radialGradient id={f} cx="50%" cy="30%" r="50%">
          <stop offset="0%" stopColor="#fff8c0" stopOpacity=".9" />
          <stop offset="100%" stopColor="#ffd040" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="18" rx="16" ry="10" fill={`url(#${f})`} />
      <path
        d="M20 28 Q18 18 32 16 Q46 18 44 28 Q48 36 40 42 L38 52 L26 52 L24 42 Q16 36 20 28 Z"
        fill={`url(#${g})`}
        stroke="#5a3810"
        strokeWidth="1.3"
      />
      <ellipse cx="32" cy="52" rx="10" ry="3" fill="#c89830" stroke="#5a3810" strokeWidth="1" />
    </svg>
  );
}

function SvgAce() {
  const id = useId().replace(/:/g, "");
  const g = `ag-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff8ec" />
          <stop offset="55%" stopColor="#d4c4a0" />
          <stop offset="100%" stopColor="#6a5a40" />
        </linearGradient>
      </defs>
      <rect x="12" y="8" width="40" height="48" rx="5" fill={`url(#${g})`} stroke="#3a3020" strokeWidth="1.5" />
      <text
        x="32"
        y="40"
        textAnchor="middle"
        fontSize="28"
        fontWeight="800"
        fill="#1a1208"
        fontFamily="Georgia, serif"
      >
        A
      </text>
      <circle cx="20" cy="18" r="3" fill="#8a1c22" />
      <circle cx="44" cy="46" r="3" fill="#8a1c22" />
    </svg>
  );
}

function SvgBar() {
  const id = useId().replace(/:/g, "");
  const g = `bg-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8ecef" />
          <stop offset="50%" stopColor="#8a929a" />
          <stop offset="100%" stopColor="#2a3038" />
        </linearGradient>
      </defs>
      <rect x="8" y="22" width="48" height="20" rx="3" fill={`url(#${g})`} stroke="#1a1e24" strokeWidth="1.4" />
      <text
        x="32"
        y="37"
        textAnchor="middle"
        fontSize="14"
        fontWeight="900"
        letterSpacing="2"
        fill="#f4f6f8"
        fontFamily="system-ui, sans-serif"
      >
        BAR
      </text>
    </svg>
  );
}

type ArtMeta = { label: string; tone: string; Svg: () => ReactNode };

export const SYM_ART: Record<Symbol, ArtMeta> = {
  WILD: { label: "WILD", tone: "wild", Svg: SvgWild },
  CROWN: { label: "CROWN", tone: "crown", Svg: SvgCrown },
  DIAMOND: { label: "GEM", tone: "diamond", Svg: SvgGem },
  ACE: { label: "ACE", tone: "ace", Svg: SvgAce },
  CHIP: { label: "CHIP", tone: "chip", Svg: SvgChip },
  HORSE: { label: "TRACK", tone: "horse", Svg: SvgHorse },
  LAMP: { label: "LAMP", tone: "lamp", Svg: SvgLamp },
  BAR: { label: "BAR", tone: "bar", Svg: SvgBar },
};

function randSym(): Symbol {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!;
}

function fillerStrip(n: number): Symbol[] {
  return Array.from({ length: n }, () => randSym());
}

function SymTile({
  sym,
  spinning,
  win,
}: {
  sym: Symbol;
  spinning?: boolean;
  win?: boolean;
}) {
  const SYM_H = useContext(SymHCtx);
  const art = SYM_ART[sym] ?? SYM_ART.BAR;
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
  final: Symbol[] | null;
  spinning: boolean;
  settled: boolean;
  winRows: Set<number>;
  spinGen: number;
  onStopped: (index: number) => void;
};

function Reel({ index, final, spinning, settled, winRows, spinGen, onStopped }: ReelProps) {
  const SYM_H = useContext(SymHCtx);
  const [strip, setStrip] = useState<Symbol[]>(() => ["BAR", "CHIP", "LAMP"]);
  const [offset, setOffset] = useState(0);
  const [blur, setBlur] = useState(false);
  const [transitionMs, setTransitionMs] = useState(0);
  const stoppedForGen = useRef(-1);
  const cycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onStoppedRef = useRef(onStopped);
  onStoppedRef.current = onStopped;

  const clearCycle = () => {
    if (cycleRef.current) {
      clearInterval(cycleRef.current);
      cycleRef.current = null;
    }
  };

  useEffect(() => {
    if (spinning) return;
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
    stoppedForGen.current = -1;
    setBlur(true);
    setTransitionMs(0);
    setStrip(fillerStrip(FILLER_LEN));
    setOffset(0);

    cycleRef.current = setInterval(() => {
      setStrip(fillerStrip(FILLER_LEN));
      setOffset(-(Math.floor(Math.random() * 5) * SYM_H));
    }, 70);

    return clearCycle;
  }, [spinning, spinGen, SYM_H]);

  useEffect(() => {
    if (!spinning || !final || final.length !== 3) return;
    if (stoppedForGen.current === spinGen) return;

    clearCycle();
    const lead = fillerStrip(FILLER_LEN);
    const next = [...lead, ...final];
    setStrip(next);
    setOffset(0);
    setBlur(true);
    setTransitionMs(0);

    const target = -((next.length - VISIBLE) * SYM_H);
    const duration = STOP_MS[index] ?? 2000;

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setTransitionMs(duration);
        setOffset(target);
      });
    });

    const t = window.setTimeout(() => {
      setBlur(false);
      setStrip(final);
      setOffset(0);
      setTransitionMs(0);
      stoppedForGen.current = spinGen;
      onStoppedRef.current(index);
    }, duration + 48);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(t);
    };
  }, [spinning, final, index, spinGen, SYM_H]);

  return (
    <div className={`reel${blur ? " is-spinning" : ""}`}>
      <div
        className="reel-strip"
        style={{
          transform: `translate3d(0, ${offset}px, 0)`,
          transition:
            transitionMs > 0
              ? `transform ${transitionMs}ms cubic-bezier(0.12, 0.75, 0.18, 1)`
              : "none",
        }}
      >
        {strip.map((sym, i) => {
          const win =
            settled && !blur && strip.length === VISIBLE && winRows.has(i);
          return (
            <SymTile
              key={`${spinGen}-${i}-${sym}-${strip.length}`}
              sym={sym}
              spinning={blur}
              win={win}
            />
          );
        })}
      </div>
    </div>
  );
}

const IDLE: Symbol[][] = [
  ["BAR", "CHIP", "LAMP"],
  ["HORSE", "ACE", "BAR"],
  ["LAMP", "DIAMOND", "CHIP"],
  ["ACE", "BAR", "HORSE"],
  ["CHIP", "LAMP", "CROWN"],
];

export default function SlotMachine({
  grid,
  spinning,
  winCells,
  onSpinComplete,
}: {
  grid: Symbol[][] | null;
  spinning: boolean;
  winCells?: WinCell[];
  onSpinComplete?: () => void;
}) {
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
    <div className="slot-cabinet" style={{ ["--sym-h" as string]: `${symH}px` }}>
      <div className="slot-lamp" aria-hidden />
      <div className="slot-top-lights" aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="slot-marquee">
        <span className="slot-marquee-gem" aria-hidden />
        <span className="slot-marquee-text">Gilded Track</span>
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
            <span className="plc top" />
            <span className="plc mid" />
            <span className="plc bot" />
          </div>
          <div className="slot-window" role="img" aria-label="Gilded Track reels">
            <div className="slot-glass" aria-hidden />
            {[0, 1, 2, 3, 4].map((r) => {
              let final: Symbol[] | null = null;
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
            <span className="plc top" />
            <span className="plc mid" />
            <span className="plc bot" />
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
        <span>9 LINES</span>
        <span className="slot-kick-dot" />
        <span>5 REELS</span>
        <span className="slot-kick-dot" />
        <span>GILDED TRACK</span>
      </div>
    </div>
    </SymHCtx.Provider>
  );
}
