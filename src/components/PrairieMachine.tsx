"use client";

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { coinLabel, type PrSymbol } from "@/lib/games/prairie";
import type { WinShow } from "@/lib/winShow";
import { CabinetChrome, CabinetTopper } from "./SlotCabinet";
import { slotBlurCycleMs, slotLandPlan, slotReelOffset, shouldReelBounce, SLOT_BOUNCE_PX, SLOT_SETTLE_MS_NORMAL, SLOT_SETTLE_MS_TURBO } from "@/lib/slotFeel";
import { playThunk, reducedMotion } from "@/lib/feel";
import { PRAIRIE_ART } from "./PrairieSymbols";

const VISIBLE = 3;
const FILLER_LEN = 28;

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

export const PR_SYM_ART: Record<PrSymbol, ArtMeta> = PRAIRIE_ART;
/** Symbols shown blurred while a reel is moving (no 2x/3x faces in the base game). */
const FILLER: PrSymbol[] = ["BUFFALO", "EAGLE", "COYOTE", "BOOTS", "A", "K", "Q", "J", "COIN", "WILD", "STORM"];

function coinText(x: number) { return coinLabel(x) ?? `${x}×`; }

function randSym(): PrSymbol {
  return FILLER[Math.floor(Math.random() * FILLER.length)]!;
}

function fillerStrip(n: number): PrSymbol[] {
  return Array.from({ length: n }, () => randSym());
}

function SymTile({
  sym,
  spinning,
  win,
  coinX,
}: {
  sym: PrSymbol;
  spinning?: boolean;
  win?: boolean;
  /** Coin value (x bet) printed on a landed COIN. */
  coinX?: number | null;
}) {
  const SYM_H = useContext(SymHCtx);
  const art = PR_SYM_ART[sym] ?? PR_SYM_ART.J;
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
      {coinX != null && !spinning && (
        <span className={`pr-coin-val${coinLabel(coinX) ? " jp" : ""}`} aria-label={`coin worth ${coinText(coinX)} bet`}>{coinText(coinX)}</span>
      )}
    </div>
  );
}

type ReelProps = {
  index: number;
  final: PrSymbol[] | null;
  spinning: boolean;
  settled: boolean;
  winRows: Set<number>;
  coins?: (number | null)[] | null;
  spinGen: number;
  stopAllTick: number;
  turbo: boolean;
  onStopped: (index: number) => void;
};

function Reel({ index, final, spinning, settled, winRows, coins, spinGen, stopAllTick, turbo, onStopped }: ReelProps) {
  const SYM_H = useContext(SymHCtx);
  const [strip, setStrip] = useState<PrSymbol[]>(() => ["A", "K", "Q"]);
  const [offset, setOffset] = useState(0);
  const [blur, setBlur] = useState(false);
  const [transitionMs, setTransitionMs] = useState(0);
  const [landed, setLanded] = useState(true);
  const [settling, setSettling] = useState(false);
  const [earlyTick, setEarlyTick] = useState(0);
  const settleClearRef = useRef<number>(0);
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

  const markLanded = (syms: PrSymbol[], slammed = false) => {
    if (stoppedForGen.current === spinGen) return;
    clearCycle();
    setBlur(false);
    setStrip(syms);
    setOffset(0);
    setTransitionMs(0);
    stoppedForGen.current = spinGen;
    setLanded(true);
    const bounce = shouldReelBounce({ reducedMotion: reducedMotion(), slammed });
    if (settleClearRef.current) window.clearTimeout(settleClearRef.current);
    setSettling(bounce);
    if (bounce) {
      const ms = turbo ? SLOT_SETTLE_MS_TURBO : SLOT_SETTLE_MS_NORMAL;
      settleClearRef.current = window.setTimeout(() => setSettling(false), ms);
    }
    playThunk();
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
    setSettling(false);
    if (settleClearRef.current) window.clearTimeout(settleClearRef.current);
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
  // Only react to stopAllTick changes — do not re-fire on spinGen.
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
      markLanded(final, true);
      return;
    }

    clearCycle();
    const lead = fillerStrip(FILLER_LEN);
    const next = [...lead, ...final];
    setStrip(next);
    setOffset(0);
    setBlur(true);
    setTransitionMs(0);
    const plan = slotLandPlan({ reelIndex: index, turbo, reducedMotion: reducedMotion() });
    const target = slotReelOffset(-((next.length - VISIBLE) * SYM_H), plan.bouncePx);
    const duration = plan.stopMs;
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
  }, [spinning, final, index, spinGen, SYM_H, earlyTick, turbo]);

  const interactive = spinning && !landed;

  const requestEarlyStop = () => {
    if (!interactive) return;
    wantEarly.current = true;
    setEarlyTick((n) => n + 1);
  };

  return (
    <div
      className={`reel${blur ? " is-spinning" : ""}${interactive ? " reel-tap-stop" : ""}${settling ? " is-settling" : ""}`}
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
          ["--reel-bounce" as string]: `${SLOT_BOUNCE_PX}px`,
          ["--reel-settle-ms" as string]: `${turbo ? SLOT_SETTLE_MS_TURBO : SLOT_SETTLE_MS_NORMAL}ms`,
        }}
      >
        {strip.map((sym, i) => {
          const win = settled && !blur && strip.length === VISIBLE && winRows.has(i);
          return (
            <SymTile key={`${spinGen}-${i}-${sym}-${strip.length}`} sym={sym} spinning={blur} win={win} coinX={!blur && landed && strip.length === VISIBLE && sym === "COIN" ? coins?.[i] ?? null : null} />
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

const IDLE: PrSymbol[][] = [
  ["K", "BUFFALO", "Q"],
  ["A", "WILD", "EAGLE"],
  ["BUFFALO", "BUFFALO", "J"],
  ["COYOTE", "A", "Q"],
  ["J", "BOOTS", "K"],
];

export type PrairieTheme = {
  title?: string;
  kickLabels?: string[];
  /** Extra class on cabinet root for CSS theme hooks */
  cabinetClass?: string;
};

const DEFAULT_THEME: Required<PrairieTheme> = {
  title: "Thunderhoof Prairie",
  kickLabels: ["243 ways", "Free spins · Hold & Spin", "Sandbox / test chips"],
  cabinetClass: "prairie-cabinet",
};

/**
 * Thunderhoof Prairie cabinet (story slot, 243 ways). Same reel mechanics as the other video
 * cabinets; outcomes always come from the server. During Hold & Spin the board replaces the reels.
 */
export type PrairieMachineHandle = {
  stopAll: () => void;
};

const PrairieMachine = forwardRef<
  PrairieMachineHandle,
  {
    grid: PrSymbol[][] | null;
    spinning: boolean;
    winCells?: WinCell[];
    /** Paid wins drawn over the reels after they settle (src/lib/winShow.ts). */
    winShows?: WinShow[];
    onSpinComplete?: () => void;
    theme?: PrairieTheme;
    /** 0–4 from slotGlowTier on the real paid return; lights only after the reels settle. */
    glow?: number;
    /** Animate the lights (Sound & feel on and no reduced motion). Otherwise they light steadily. */
    glowLive?: boolean;
    /** Shorten reel settle times; outcomes still come from the server. */
    turbo?: boolean;
    /** Cabinet parts (physical-cabinet chrome). */
    topper?: ReactNode;
    belly?: ReactNode;
    deck?: ReactNode;
    lever?: ReactNode;
    /** Coin values (x bet) per reel/row from the server result. */
    coins?: (number | null)[][] | null;
    /** Hold & Spin board; replaces the reels while the round plays. */
    hold?: ReactNode;
    /** Feature trigger flash: "fs" (storm) or "hold" (coins). Static when reduced motion. */
    trigger?: "fs" | "hold" | null;
    /** Free-spins mode skin. */
    freeMode?: boolean;
  }
>(function PrairieMachine({ grid, spinning, winCells, winShows, onSpinComplete, theme, glow = 0, glowLive = false, turbo = false, topper, belly, deck, lever, coins = null, hold, trigger = null, freeMode = false }, ref) {
  const t = { ...DEFAULT_THEME, ...theme, kickLabels: theme?.kickLabels ?? DEFAULT_THEME.kickLabels };
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

  const reels = [0, 1, 2, 3, 4].map((r) => {
    let final: PrSymbol[] | null = null;
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
        coins={grid?.[r] ? coins?.[r] ?? null : null}
        spinGen={spinGen}
        stopAllTick={stopAllTick}
        turbo={turbo}
        onStopped={onStopped}
      />
    );
  });

  return (
    <SymHCtx.Provider value={symH}>
      <CabinetChrome
        themeClass={`cab-prairie ${t.cabinetClass}${trigger ? ` pr-trig pr-trig-${trigger}` : ""}${freeMode ? " pr-free" : ""}${hold ? " pr-holdmode" : ""}`}
        glow={glow}
        glowLive={glowLive}
        spinning={spinning}
        settled={settled}
        symH={symH}
        topper={topper ?? <CabinetTopper title={t.title} kicker="243 ways · Free spins · Hold & Spin" />}
        belly={belly}
        deck={deck}
        lever={lever}
        paylines={[]}
        winShows={winShows}
        windowLabel={`${t.title} reels`}
        kick={t.kickLabels}
      >
        {hold ?? reels}
      </CabinetChrome>
    </SymHCtx.Provider>
  );
});

export default PrairieMachine;
