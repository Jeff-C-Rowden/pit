"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SYMBOLS, type Symbol } from "@/lib/games/slot";

const SYM_H = 76;
const VISIBLE = 3;
const FILLER_LEN = 22;
const STOP_MS = [1200, 1400, 1600, 1800, 2000] as const;

export type WinCell = { reel: number; row: number };

type Art = { icon: string; label: string; tone: string };

/** Original Pit art language — emoji + short label; jewel/metal faces via CSS tones. */
export const SYM_ART: Record<Symbol, Art> = {
  WILD: { icon: "✦", label: "WILD", tone: "wild" },
  CROWN: { icon: "♛", label: "CROWN", tone: "crown" },
  DIAMOND: { icon: "◆", label: "GEM", tone: "diamond" },
  ACE: { icon: "Ⓐ", label: "ACE", tone: "ace" },
  CHIP: { icon: "●", label: "CHIP", tone: "chip" },
  HORSE: { icon: "♞", label: "TRACK", tone: "horse" },
  LAMP: { icon: "✧", label: "LAMP", tone: "lamp" },
  BAR: { icon: "▬", label: "BAR", tone: "bar" },
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
  const art = SYM_ART[sym] ?? SYM_ART.BAR;
  return (
    <div
      className={`sym tone-${art.tone}${spinning ? " spinning" : ""}${win ? " win" : ""}`}
      style={{ height: SYM_H }}
      aria-label={sym}
    >
      <span className="sym-face">
        <span className="sym-icon" aria-hidden>
          {art.icon}
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
  }, [spinning, spinGen]);

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
  }, [spinning, final, index, spinGen]);

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
            settled &&
            !blur &&
            strip.length === VISIBLE &&
            winRows.has(i);
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
    <div className="slot-cabinet">
      <div className="slot-lamp" aria-hidden />
      <div className="slot-marquee">
        <span className="slot-marquee-text">Gilded Track</span>
      </div>
      <div className="slot-window" role="img" aria-label="Gilded Track reels">
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
      <div className="slot-rail" aria-hidden />
    </div>
  );
}
