"use client";

import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { SYMBOLS, type Symbol } from "@/lib/games/slot";
import { slotBlurCycleMs, slotStopMs } from "@/lib/slotFeel";
import { HOARD_ART } from "./DragonSymbols";

const VISIBLE = 3;
const FILLER_LEN = 28;

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

type ArtMeta = { label: string; tone: string; Svg: () => ReactNode };

export const SYM_ART: Record<Symbol, ArtMeta> = HOARD_ART;

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
      aria-label={art.label}
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
  stopAllTick: number;
  turbo: boolean;
  onStopped: (index: number) => void;
};

function Reel({ index, final, spinning, settled, winRows, spinGen, stopAllTick, turbo, onStopped }: ReelProps) {
  const SYM_H = useContext(SymHCtx);
  const [strip, setStrip] = useState<Symbol[]>(() => ["BAR", "CHIP", "LAMP"]);
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

  const markLanded = (syms: Symbol[]) => {
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
    }, slotBlurCycleMs(turbo));

    return clearCycle;
  }, [spinning, spinGen, SYM_H, turbo]);

  // Stop-all / Stop button: same path as tap-to-stop (queue until grid, then snap).
  // Only react to stopAllTick changes — do not re-fire on spinGen or a leftover tick would
  // instantly stop the next spin.
  useEffect(() => {
    if (stopAllTick === 0) return;
    if (!spinning || stoppedForGen.current === spinGen) return;
    wantEarly.current = true;
    setEarlyTick((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: stopAllTick only
  }, [stopAllTick]);

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
    const duration = slotStopMs(index, turbo);

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
    // earlyTick re-runs so a mid-anim tap can snap immediately
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markLanded closes over spinGen/index
  }, [spinning, final, index, spinGen, SYM_H, earlyTick, turbo]);

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
      {interactive && (
        <span className="reel-tap-hint" aria-hidden>
          Tap
        </span>
      )}
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

export type SlotMachineHandle = {
  stopAll: () => void;
};

const SlotMachine = forwardRef<
  SlotMachineHandle,
  {
    grid: Symbol[][] | null;
    spinning: boolean;
    winCells?: WinCell[];
    onSpinComplete?: () => void;
    /** 0–4 from slotGlowTier on the real paid return; lights only after the reels settle. */
    glow?: number;
    /** Animate the lights (Sound & feel on and no reduced motion). Otherwise they light steadily. */
    glowLive?: boolean;
    /** Shorten reel settle times; outcomes still come from the server. */
    turbo?: boolean;
  }
>(function SlotMachine({ grid, spinning, winCells, onSpinComplete, glow = 0, glowLive = false, turbo = false }, ref) {
  const symH = useSymHeight();
  const [spinGen, setSpinGen] = useState(0);
  const [settled, setSettled] = useState(true);
  const [stopAllTick, setStopAllTick] = useState(0);
  const stopped = useRef<Set<number>>(new Set());
  const completedGen = useRef(-1);
  const completeRef = useRef(onSpinComplete);
  completeRef.current = onSpinComplete;
  const genRef = useRef(spinGen);
  genRef.current = spinGen;

  useImperativeHandle(ref, () => ({
    stopAll: () => setStopAllTick((n) => n + 1),
  }), []);

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
    <div className={`slot-cabinet${settled && !spinning && glow > 0 ? ` glow-t${glow}${glowLive ? " glow-live" : ""}` : ""}`} data-glow={settled && !spinning ? glow : 0} style={{ ["--sym-h" as string]: `${symH}px` }}>
      <div className="slot-lamp" aria-hidden />
      <div className="slot-win-halo" aria-hidden />
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
                  stopAllTick={stopAllTick}
                  turbo={turbo}
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
});

export default SlotMachine;
