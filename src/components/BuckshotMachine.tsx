"use client";
/**
 * Buckshot Bars reels: three classic drums showing the real strip (payline stop and its true
 * neighbours). Reels stop left to right on a fixed schedule that never depends on the
 * outcome; any reel can be tapped to stop early once the server result is in. No near-miss
 * slow-downs, no anticipation, no re-ordering.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { BB_REELS, type BbSymbol } from "@/lib/games/buckshot";
import { BUCKSHOT_ART } from "./WesternSymbols";
import type { WinShow } from "@/lib/winShow";
import { CabinetChrome } from "./SlotCabinet";
import { slotStaggerStops, SLOT_BOUNCE_PX, SLOT_SETTLE_MS_NORMAL, SLOT_SETTLE_MS_TURBO } from "@/lib/slotFeel";
import { playThunk } from "@/lib/feel";
import type { ReactNode } from "react";

export type BuckshotHandle = { stopAll: () => void };

/** Fixed stop schedule (ms after the result arrives) — same for every outcome. */
export function buckshotStopSchedule(turbo: boolean, reduced: boolean): number[] {
  if (reduced) return [0, 0, 0];
  return slotStaggerStops(turbo ? 250 : 700, 3);
}

function Cell({ sym, h }: { sym: BbSymbol; h: number }) {
  const a = BUCKSHOT_ART[sym];
  const I = a.Svg;
  return (
    <div className={`sym bb-cell tone-${a.tone}`} style={{ height: h }} aria-label={a.label}>
      <span className="sym-face"><span className="sym-icon" aria-hidden><I /></span></span>
    </div>
  );
}

function useSymH() {
  const [h, setH] = useState(96);
  useEffect(() => {
    const f = () => setH(window.innerWidth <= 380 ? 60 : window.innerWidth <= 720 ? 72 : 96);
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return h;
}

type Props = {
  window: BbSymbol[][] | null;
  spinning: boolean;
  turbo: boolean;
  reduced: boolean;
  onSpinComplete: () => void;
  glow: number;
  glowLive: boolean;
  won: boolean;
  /** Paid win drawn over the payline after the reels settle. */
  winShows?: WinShow[];
  topper: ReactNode;
  deck: ReactNode;
  lever?: ReactNode;
  side?: ReactNode;
};

const BuckshotMachine = forwardRef<BuckshotHandle, Props>(function BuckshotMachine(
  { window: win, spinning, turbo, reduced, onSpinComplete, glow, glowLive, won, winShows, topper, deck, lever, side },
  ref,
) {
  const h = useSymH();
  const [stopped, setStopped] = useState<boolean[]>([true, true, true]);
  const [slammed, setSlammed] = useState(false);
  const timers = useRef<number[]>([]);
  const doneRef = useRef(false);
  const thunked = useRef<boolean[]>([false, false, false]);
  const shown = useRef<BbSymbol[][]>(BB_REELS.map((s) => [s[s.length - 1]!, s[0]!, s[1]!]));
  if (win && stopped.every(Boolean) && !spinning) shown.current = win;

  const clear = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };
  const land = (r: number) => {
    setStopped((s) => {
      if (s[r]) return s;
      return s.map((v, i) => (i === r ? true : v));
    });
    if (!thunked.current[r]) {
      thunked.current[r] = true;
      playThunk();
    }
  };

  // a new spin: every reel starts moving
  useEffect(() => {
    if (spinning) { doneRef.current = false; setSlammed(false); thunked.current = [false, false, false]; setStopped([false, false, false]); }
  }, [spinning]);

  // result arrived: schedule the fixed left-to-right stops
  useEffect(() => {
    if (!spinning || !win) return;
    clear();
    buckshotStopSchedule(turbo, reduced).forEach((ms, r) => {
      timers.current.push(window.setTimeout(() => land(r), ms));
    });
    return clear;
  }, [spinning, win, turbo, reduced]);

  useEffect(() => {
    if (spinning && win && stopped.every(Boolean) && !doneRef.current) {
      doneRef.current = true;
      shown.current = win;
      onSpinComplete();
    }
  }, [stopped, spinning, win, onSpinComplete]);

  useEffect(() => clear, []);

  useImperativeHandle(ref, () => ({
    stopAll: () => { if (win) { clear(); setSlammed(true); [0, 1, 2].forEach(land); } },
  }), [win]);

  const stopOne = (r: number) => { if (spinning && win && !stopped[r]) land(r); };
  const settled = !spinning && stopped.every(Boolean);
  const label = win ? `Payline: ${win.map((w) => BUCKSHOT_ART[w[1]!].label).join(", ")}` : "Buckshot Bars reels";

  return (
    <CabinetChrome
      themeClass="cab-classic"
      glow={glow}
      glowLive={glowLive}
      spinning={spinning}
      settled={settled}
      symH={h}
      topper={topper}
      deck={deck}
      lever={lever}
      paylines={[[1, 1, 1]]}
      winLines={won ? [0] : []}
      winShows={winShows}
      windowLabel={label}
      kick={["1 payline", "3 reels", "Sandbox / test chips"]}
      singleLine
      side={side}
    >
      <div className="bb-reels" style={{ ["--bb-h" as string]: `${h}px` }}>
        {[0, 1, 2].map((r) => {
          const moving = spinning && !stopped[r];
          const strip = BB_REELS[r]!;
          const cells = moving ? [...strip, ...strip] : (spinning && win ? win[r]! : shown.current[r]!);
          return (
            <button
              key={r}
              type="button"
              className={`reel bb-reel${moving ? " moving" : ""}${won && settled ? " win" : ""}`}
              onClick={() => stopOne(r)}
              aria-label={moving ? `Stop reel ${r + 1}` : `Reel ${r + 1}`}
              title={moving && win ? "Tap to stop" : undefined}
              disabled={!moving}
            >
              <span
                className={`bb-strip${moving ? " spin" : slammed ? "" : " settle"}`}
                style={{
                  ["--reel-bounce" as string]: `${SLOT_BOUNCE_PX}px`,
                  ["--reel-settle-ms" as string]: `${turbo ? SLOT_SETTLE_MS_TURBO : SLOT_SETTLE_MS_NORMAL}ms`,
                  ...(moving ? { ["--bb-n" as string]: strip.length } : {}),
                }}
              >
                {cells.map((s, i) => <Cell key={i} sym={s} h={h} />)}
              </span>
            </button>
          );
        })}
      </div>
    </CabinetChrome>
  );
});

export default BuckshotMachine;
