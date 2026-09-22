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
const FILLER_LEN = 22;
const STOP_MS = [1200, 1400, 1600, 1800, 2000] as const;

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
  const g = `vsw-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff4c8" />
          <stop offset="50%" stopColor="#e0a820" />
          <stop offset="100%" stopColor="#6a4010" />
        </linearGradient>
      </defs>
      <polygon
        points="32,4 38,24 58,24 42,36 48,56 32,44 16,56 22,36 6,24 26,24"
        fill={`url(#${g})`}
        stroke="#3a2808"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SvgJackpot() {
  const id = useId().replace(/:/g, "");
  const g = `vsj-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe9a0" />
          <stop offset="45%" stopColor="#f0b428" />
          <stop offset="100%" stopColor="#8a5010" />
        </linearGradient>
      </defs>
      <rect x="10" y="14" width="44" height="36" rx="4" fill={`url(#${g})`} stroke="#3a2408" strokeWidth="1.5" />
      <text x="32" y="38" textAnchor="middle" fontSize="11" fontWeight="900" fill="#1a1004" fontFamily="system-ui">
        JP
      </text>
      <circle cx="32" cy="22" r="3" fill="#fff8d0" />
    </svg>
  );
}

function SvgKey() {
  const id = useId().replace(/:/g, "");
  const g = `vsk-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0e0a8" />
          <stop offset="100%" stopColor="#8a6820" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="10" fill="none" stroke={`url(#${g})`} strokeWidth="4" />
      <rect x="32" y="21" width="22" height="6" rx="1" fill={`url(#${g})`} />
      <rect x="46" y="27" width="4" height="10" fill={`url(#${g})`} />
      <rect x="40" y="27" width="4" height="7" fill={`url(#${g})`} />
    </svg>
  );
}

function SvgIngot() {
  const id = useId().replace(/:/g, "");
  const g = `vsi-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff0b0" />
          <stop offset="50%" stopColor="#d4a018" />
          <stop offset="100%" stopColor="#6a4810" />
        </linearGradient>
      </defs>
      <path d="M14 40 L20 22 L44 22 L50 40 Z" fill={`url(#${g})`} stroke="#3a2808" strokeWidth="1.4" />
      <rect x="14" y="40" width="36" height="8" rx="1" fill={`url(#${g})`} stroke="#3a2808" strokeWidth="1.2" />
    </svg>
  );
}

function SvgSafe() {
  const id = useId().replace(/:/g, "");
  const g = `vss-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c8d0d8" />
          <stop offset="50%" stopColor="#586878" />
          <stop offset="100%" stopColor="#1a2430" />
        </linearGradient>
      </defs>
      <rect x="12" y="12" width="40" height="40" rx="3" fill={`url(#${g})`} stroke="#0a1018" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="10" fill="#0e1820" stroke="#e8c878" strokeWidth="2" />
      <circle cx="32" cy="32" r="3" fill="#e8c878" />
    </svg>
  );
}

function SvgGem() {
  const id = useId().replace(/:/g, "");
  const g = `vsg-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8fff8" />
          <stop offset="40%" stopColor="#38c8a0" />
          <stop offset="100%" stopColor="#0a4838" />
        </linearGradient>
      </defs>
      <polygon points="32,8 50,24 40,52 24,52 14,24" fill={`url(#${g})`} stroke="#083028" strokeWidth="1.3" />
    </svg>
  );
}

function SvgCoin() {
  const id = useId().replace(/:/g, "");
  const g = `vsc-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff2b8" />
          <stop offset="50%" stopColor="#c89820" />
          <stop offset="100%" stopColor="#5a3810" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="22" fill={`url(#${g})`} stroke="#3a2408" strokeWidth="2" />
      <text x="32" y="38" textAnchor="middle" fontSize="18" fontWeight="800" fill="#2a1808" fontFamily="Georgia, serif">
        $
      </text>
    </svg>
  );
}

function SvgLock() {
  const id = useId().replace(/:/g, "");
  const g = `vsl-${id}`;
  return (
    <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d0d4d8" />
          <stop offset="100%" stopColor="#303840" />
        </linearGradient>
      </defs>
      <path d="M22 28 V20 Q22 10 32 10 Q42 10 42 20 V28" fill="none" stroke={`url(#${g})`} strokeWidth="4" />
      <rect x="16" y="28" width="32" height="26" rx="3" fill={`url(#${g})`} stroke="#101418" strokeWidth="1.3" />
      <circle cx="32" cy="40" r="4" fill="#101418" />
    </svg>
  );
}

type ArtMeta = { label: string; tone: string; Svg: () => ReactNode };

export const VS_SYM_ART: Record<VsSymbol, ArtMeta> = {
  WILD: { label: "WILD", tone: "wild", Svg: SvgWild },
  JACKPOT: { label: "JACKPOT", tone: "jackpot", Svg: SvgJackpot },
  KEY: { label: "KEY", tone: "key", Svg: SvgKey },
  INGOT: { label: "INGOT", tone: "ingot", Svg: SvgIngot },
  SAFE: { label: "SAFE", tone: "safe", Svg: SvgSafe },
  GEM: { label: "GEM", tone: "gem", Svg: SvgGem },
  COIN: { label: "COIN", tone: "coin", Svg: SvgCoin },
  LOCK: { label: "LOCK", tone: "lock", Svg: SvgLock },
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
  const art = VS_SYM_ART[sym] ?? VS_SYM_ART.LOCK;
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
  const [strip, setStrip] = useState<VsSymbol[]>(() => ["LOCK", "COIN", "GEM"]);
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
    </div>
  );
}

const IDLE: VsSymbol[][] = [
  ["LOCK", "COIN", "GEM"],
  ["SAFE", "KEY", "LOCK"],
  ["COIN", "INGOT", "SAFE"],
  ["KEY", "LOCK", "GEM"],
  ["GEM", "COIN", "JACKPOT"],
];

export type VaultTheme = {
  title?: string;
  kickLabels?: [string, string, string];
  /** Extra class on cabinet root for CSS theme hooks */
  cabinetClass?: string;
};

const DEFAULT_THEME: Required<VaultTheme> = {
  title: "Vault Spire",
  kickLabels: ["9 LINES", "5 REELS", "PROGRESSIVE"],
  cabinetClass: "vault-cabinet",
};

/**
 * Vault Spire cabinet. Extension point: `theme` props for post-research redesign
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
    const ms = grid ? 4500 : 8500;
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
