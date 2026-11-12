"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Shell from "@/components/Shell";
import { scatterShow, waysShows } from "@/lib/winShow";
import PrairieMachine, { PR_SYM_ART, type PrairieMachineHandle, type WinCell } from "@/components/PrairieMachine";
import { AdaPortrait, PrairieCoin } from "@/components/PrairieSymbols";
import { ActionDock, OutcomeBanner, FirstVisitTip, useClearErrOnBalance } from "@/components/TableUX";
import { MathStrip } from "@/components/VolatilityMeter";
import { api, money, useUser } from "@/components/useUser";
import {
  PR_PAYTABLE, PR_FS_AWARD, PR_FS_CAP, PR_SCATTER_PAY, PR_BET_COINS, PR_COIN_VALUES, PR_HS_TRIGGER, PR_HS_RESPINS, PR_HS_Q_PERMILLE,
  coinLabel, type PrSymbol, type PrPaySymbol,
} from "@/lib/games/prairie";
import { PRAIRIE_MATH, PRAIRIE_FEATURE_LINE } from "@/lib/gameMath";
import { slotGlowTier, soundOn, reducedMotion, playSpin, playFeature, playChip } from "@/lib/feel";
import { SLOT_TURBO_KEY, slotTurboEffective } from "@/lib/slotFeel";
import QuickBetRow, { useLastBet } from "@/components/QuickBet";
import { SLOT_COIN_CHIPS, SLOT_COIN_MAX, SLOT_COIN_MIN } from "@/lib/quickBet";
import { CabinetBelly, CabinetDeck, CabinetLever, CabinetTopper, useAutoSpin } from "@/components/SlotCabinet";
import { ledText, stepCoin, maxBetCoin, maxBetRefusal } from "@/lib/cabinet";
import SpinNotice from "@/components/SpinNotice";

type WayWin = { symbol: PrPaySymbol; reels: number; ways: number; mult: number; pay: number; winCents: number };
type FreeSpin = { n: number; grid: PrSymbol[][]; wins: WayWin[]; scatters: number; winCents: number; retrigger: number; awardedTotal: number };
type Coin = { cell: number; x: number };
type Hold = { start: Coin[]; respins: { landed: Coin[]; respinsLeft: number }[]; board: (number | null)[]; totalX: number; totalWinCents: number; full: boolean };
type Spin = {
  id: string; coinCents: number; betCents: number; grid: PrSymbol[][]; coins: (number | null)[][]; wins: WayWin[];
  waysWinCents: number; scatters: number; scatterWinCents: number; baseWinCents: number; winCents: number;
  freeSpins: { initial: number; spins: FreeSpin[]; totalWinCents: number; capped: boolean } | null;
  hold: Hold | null;
};
type Phase = "idle" | "spinning" | "trigger" | "hold" | "fs" | "summary";

const STORY_KEY = "pit_story_v1:prairie";
const WILDS: PrSymbol[] = ["WILD", "W2", "W3"];
const coinText = (x: number) => coinLabel(x) ?? `${x}×`;

function prWayShows(grid: PrSymbol[][] | null, wins: WayWin[] | undefined) {
  return waysShows(grid, wins, WILDS, (s) => PR_SYM_ART[s as PrSymbol]?.label ?? s);
}

function cellsFor(grid: PrSymbol[][] | null, wins: WayWin[] | undefined, extra: PrSymbol[] = []): WinCell[] {
  const out: WinCell[] = [];
  if (!grid) return out;
  const seen = new Set<string>();
  const add = (reel: number, row: number) => { const k = `${reel}-${row}`; if (!seen.has(k)) { seen.add(k); out.push({ reel, row }); } };
  for (const w of wins ?? []) for (let r = 0; r < w.reels; r++) grid[r]!.forEach((s, row) => { if (s === w.symbol || (r > 0 && WILDS.includes(s))) add(r, row); });
  grid.forEach((col, r) => col.forEach((s, row) => { if (extra.includes(s)) add(r, row); }));
  return out;
}

function StoryCard({ onClose }: { onClose: () => void }) {
  return (
    <div className="mine-modal pr-modal" role="dialog" aria-modal="true" aria-labelledby="pr-story-h">
      <div className="mine-modal-card mine-story pr-story">
        <AdaPortrait size={112} />
        <p className="mine-kicker">The story</p>
        <h2 id="pr-story-h">Ada &amp; the Thunderhoof Herd</h2>
        <p>
          Ada Thornbury rides the open range with a brass spyglass and a weather eye. When the sky turns purple over the grass, the great
          Thunderhoof herd starts to run, and the ground hums like a drum.
        </p>
        <p>
          Three storm clouds roll in free spins, where every sunset wild carries a 2× or 3× multiplier, and wilds on the same way multiply
          each other. Six or more gold herd coins and Ada calls a Hold &amp; Spin round-up: coins lock, 3 respins, and every new coin
          resets them to 3.
        </p>
        <p className="mine-story-note">Sandbox / test chips only · no cash value · 21+. Every result is drawn by the server; features don&apos;t change the odds of the next spin.</p>
        <button type="button" className="btn primary" onClick={onClose} autoFocus>Ride out</button>
      </div>
    </div>
  );
}

function TriggerBanner({ kind, spins, coins, reduced }: { kind: "fs" | "hold"; spins?: number; coins?: number; reduced: boolean }) {
  return (
    <div className={`mine-trigger pr-trigger pr-trigger-${kind}${reduced ? " still" : ""}`} role="status" aria-live="assertive">
      <div className="mine-trigger-card">
        {kind === "fs" ? (
          <>
            <span className="mine-trigger-k">The storm rolls in</span>
            <span className="mine-trigger-h">{spins} FREE SPINS</span>
            <span className="mine-trigger-s">Wilds carry 2× or 3× and multiply each other</span>
          </>
        ) : (
          <>
            <span className="mine-trigger-k">{coins} herd coins</span>
            <span className="mine-trigger-h">HOLD &amp; SPIN</span>
            <span className="mine-trigger-s">Coins lock · {PR_HS_RESPINS} respins · new coins reset to {PR_HS_RESPINS}</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Hold & Spin board, replayed from the server result one respin at a time. */
function HoldBoard({ hold, step, betCents }: { hold: Hold; step: number; betCents: number }) {
  const board: (number | null)[] = Array(15).fill(null);
  const fresh = new Set<number>();
  for (const c of hold.start) board[c.cell] = c.x;
  hold.respins.slice(0, step).forEach((r, i) => r.landed.forEach((c) => { board[c.cell] = c.x; if (i === step - 1) fresh.add(c.cell); }));
  const left = step === 0 ? PR_HS_RESPINS : hold.respins[step - 1]!.respinsLeft;
  const totalX = board.reduce<number>((a, v) => a + (v ?? 0), 0);
  return (
    <div className="pr-hold" aria-live="polite">
      <div className="pr-hold-grid" role="grid" aria-label="Hold and Spin board">
        {[0, 1, 2].map((row) => [0, 1, 2, 3, 4].map((reel) => {
          const cell = reel * 3 + row, x = board[cell];
          return (
            <div key={cell} className={`pr-hold-cell${x != null ? " locked" : ""}${fresh.has(cell) ? " fresh" : ""}${x != null && coinLabel(x) ? " jp" : ""}`} style={{ gridColumn: reel + 1, gridRow: row + 1 }} role="gridcell">
              {x != null ? (<><span className="pr-hold-art" aria-hidden><PrairieCoin /></span><span className="pr-coin-val">{coinText(x)}</span></>) : <span className="pr-hold-empty" aria-hidden />}
            </div>
          );
        }))}
      </div>
      <div className="pr-hold-meter">
        <span>Respins <b className="pr-respins">{left}</b></span>
        <span>Coins <b>{board.filter((v) => v != null).length}</b>/15</span>
        <span>Total <b>{money(Math.round(totalX * betCents))}</b></span>
      </div>
    </div>
  );
}

export default function PrairiePage() {
  const { setUser } = useUser();
  const [spin, setSpin] = useState<Spin | null>(null);
  const [grid, setGrid] = useState<PrSymbol[][] | null>(null);
  const [coins, setCoins] = useState<(number | null)[][] | null>(null);
  const [coin, setCoin] = useState(25);
  const [err, setErr] = useState<string | null>(null);
  useClearErrOnBalance(setErr);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const setPh = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  const [trigger, setTrigger] = useState<"fs" | "hold" | null>(null);
  const [fsIdx, setFsIdx] = useState(-1);
  const fsIdxRef = useRef(-1);
  const [fsWon, setFsWon] = useState(0);
  const [fsShown, setFsShown] = useState(false);
  const [retrig, setRetrig] = useState(0);
  const [holdStep, setHoldStep] = useState(0);
  const [holdDone, setHoldDone] = useState(false);
  const [story, setStory] = useState(false);
  const [paid, setPaid] = useState(0);
  const [lastCoin, rememberCoin] = useLastBet("prairie");
  const [feelLive, setFeelLive] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [maxArmed, setMaxArmed] = useState(false);
  const machineRef = useRef<PrairieMachineHandle>(null);
  const spinRef = useRef<Spin | null>(null);
  spinRef.current = spin;
  const balRef = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  const clearTimers = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };
  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    try { if (!localStorage.getItem(STORY_KEY)) setStory(true); } catch { /* ignore */ }
    const f = () => setFeelLive(soundOn() && !reducedMotion());
    f(); window.addEventListener("pit-sound", f);
    return () => window.removeEventListener("pit-sound", f);
  }, []);
  useEffect(() => {
    try { setTurbo(localStorage.getItem(SLOT_TURBO_KEY) === "1"); } catch { /* ignore */ }
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (mq) {
      setReduced(mq.matches);
      const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
      mq.addEventListener?.("change", onChange);
      setHydrated(true);
      return () => mq.removeEventListener?.("change", onChange);
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(SLOT_TURBO_KEY, turbo ? "1" : "0"); } catch { /* ignore */ }
  }, [turbo, hydrated]);
  const turboOn = slotTurboEffective(turbo, reduced);
  const closeStory = () => { try { localStorage.setItem(STORY_KEY, "1"); } catch { /* ignore */ } setStory(false); };

  const coinIn = coin * PR_BET_COINS;
  const [settleTick, setSettleTick] = useState(0);
  const auto = useAutoSpin({
    settleTick,
    spinOnce: () => void go(),
    balanceCents: useCallback(() => balRef.current, []),
    costCents: coinIn,
    jackpot: useCallback(() => !!(spinRef.current?.freeSpins || spinRef.current?.hold), []),
  });

  const fsSpin: FreeSpin | null = spin?.freeSpins && fsIdx >= 0 ? spin.freeSpins.spins[fsIdx] ?? null : null;
  const inFs = phase === "fs" || (phase === "summary" && !!spin?.freeSpins && fsIdx >= 0);

  const winShows = useMemo(() => {
    if (spinning) return [];
    if (phase === "fs" && fsSpin && fsShown) {
      const ways = prWayShows(fsSpin.grid, fsSpin.wins);
      const waysCents = fsSpin.wins.reduce((a, w) => a + w.winCents, 0);
      return [...ways, ...scatterShow(fsSpin.grid, "STORM", fsSpin.winCents - waysCents, "STORM scatter")];
    }
    if (phase === "idle" && spin) return [...prWayShows(spin.grid, spin.wins), ...scatterShow(spin.grid, "STORM", spin.scatterWinCents, "STORM scatter")];
    return [];
  }, [spin, spinning, phase, fsSpin, fsShown]);

  const winCells = useMemo(() => {
    if (spinning) return [];
    if (phase === "fs" && fsSpin && fsShown) return cellsFor(fsSpin.grid, fsSpin.wins, fsSpin.retrigger ? ["STORM"] : []);
    if (phase === "trigger") return cellsFor(spin?.grid ?? null, [], trigger === "fs" ? ["STORM"] : ["COIN"]);
    if (phase === "idle" && spin) return cellsFor(spin.grid, spin.wins, spin.scatters >= 3 ? ["STORM"] : []);
    return [];
  }, [spin, spinning, phase, fsSpin, fsShown, trigger]);

  const toSummary = useCallback(() => { setPh("summary"); }, []);

  const playNextFree = useCallback((idx: number) => {
    const s = spinRef.current;
    if (!s?.freeSpins) return;
    if (idx >= s.freeSpins.spins.length) { toSummary(); return; }
    fsIdxRef.current = idx;
    setFsIdx(idx);
    setFsShown(false);
    setRetrig(0);
    setGrid(null);
    setCoins(null);
    setSpinning(true);
    playSpin();
    later(() => setGrid(s.freeSpins!.spins[idx]!.grid), 180);
  }, [toSummary]);

  const startFree = useCallback(() => {
    setTrigger("fs");
    setPh("trigger");
    playFeature();
    later(() => { setTrigger(null); setPh("fs"); setFsWon(0); playNextFree(0); }, reducedMotion() ? 900 : 2000);
  }, [playNextFree]);

  const afterHold = useCallback(() => {
    const s = spinRef.current;
    if (s?.freeSpins) { setGrid(s.grid); setCoins(s.coins); startFree(); } else toSummary();
  }, [startFree, toSummary]);

  const runHold = useCallback(() => {
    const s = spinRef.current!;
    const h = s.hold!;
    setHoldStep(0);
    setHoldDone(false);
    setPh("hold");
    const gap = reducedMotion() ? 500 : 1000;
    h.respins.forEach((r, i) => later(() => { setHoldStep(i + 1); if (r.landed.length) playChip(); }, gap * (i + 1)));
    later(() => { setHoldDone(true); playFeature(); }, gap * (h.respins.length + 1));
  }, []);

  const startHold = useCallback(() => {
    setTrigger("hold");
    setPh("trigger");
    playFeature();
    later(() => { setTrigger(null); runHold(); }, reducedMotion() ? 900 : 2000);
  }, [runHold]);

  const onSpinComplete = useCallback(() => {
    setSpinning(false);
    const s = spinRef.current;
    if (phaseRef.current === "fs" && s?.freeSpins) {
      const fsp = s.freeSpins.spins[fsIdxRef.current]!;
      setFsShown(true);
      setFsWon((w) => w + fsp.winCents);
      const gap = reducedMotion() ? 450 : fsp.winCents > 0 ? 1200 : 650;
      if (fsp.retrigger > 0) {
        setRetrig(fsp.retrigger);
        playFeature();
        later(() => playNextFree(fsIdxRef.current + 1), gap + 1400);
      } else later(() => playNextFree(fsIdxRef.current + 1), gap);
      return;
    }
    setBusy(false);
    if (s?.hold || s?.freeSpins) {
      if (auto.running) auto.cancel();
      if (s.hold) startHold(); else startFree();
      return;
    }
    setPaid((v) => v + (s?.winCents ?? 0));
    setPh("idle");
    setSettleTick((n) => n + 1);
  }, [playNextFree, startHold, startFree, auto]);

  function skipFree() {
    const s = spinRef.current;
    if (!s?.freeSpins) return;
    clearTimers();
    setSpinning(false);
    setFsWon(s.freeSpins.totalWinCents);
    toSummary();
  }

  function skipHold() {
    const s = spinRef.current;
    if (!s?.hold) return;
    clearTimers();
    setHoldStep(s.hold.respins.length);
    setHoldDone(true);
  }

  function finishFeature() {
    setPaid((v) => v + (spinRef.current?.winCents ?? 0));
    setPh("idle");
    setFsIdx(-1);
    fsIdxRef.current = -1;
    setHoldDone(false);
    if (spinRef.current) { setGrid(spinRef.current.grid); setCoins(spinRef.current.coins); }
    setSettleTick((n) => n + 1);
  }

  async function go(coinOverride?: number) {
    if (busy || spinning || phaseRef.current !== "idle") return;
    const c = coinOverride ?? coin;
    if (balRef.current < c * PR_BET_COINS) {
      setErr(`This spin costs ${money(c * PR_BET_COINS)} (coin × ${PR_BET_COINS}). Add sandbox chips in the Cage.`);
      auto.fail();
      return;
    }
    setErr(null);
    setMaxArmed(false);
    setBusy(true);
    setSpin(null);
    setGrid(null);
    setCoins(null);
    setSpinning(true);
    setPh("spinning");
    playSpin();
    try {
      const d = await api("/api/games/prairie", { method: "POST", body: JSON.stringify({ coinCents: c, idempotencyKey: crypto.randomUUID() }) });
      rememberCoin(c);
      setSpin(d.spin);
      spinRef.current = d.spin;
      setCoins(d.spin.coins);
      setGrid(d.spin.grid);
      if (d.user) setUser(d.user);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
      auto.fail();
      setSpinning(false);
      setBusy(false);
      setPh("idle");
    }
  }

  function onPrimary() {
    if (phase === "fs") { machineRef.current?.stopAll(); return; }
    if (spinning) { machineRef.current?.stopAll(); if (auto.running) auto.cancel(); return; }
    if (auto.running) { auto.cancel(); return; }
    void go();
  }

  function onMaxBet() {
    const best = maxBetCoin(balRef.current, PR_BET_COINS, SLOT_COIN_MIN, SLOT_COIN_MAX);
    if (best === null) { setMaxArmed(false); setErr(maxBetRefusal(money(balRef.current), money(SLOT_COIN_MIN * PR_BET_COINS))); return; }
    if (!maxArmed) { setMaxArmed(true); return; }
    setCoin(best);
    setMaxArmed(false);
    setErr(null);
  }

  const pays = (["BUFFALO", "EAGLE", "COYOTE", "BOOTS"] as PrPaySymbol[]).map((k) => {
    const a = PR_SYM_ART[k];
    return { key: k, label: a.label, tone: a.tone, Svg: a.Svg, pay5: PR_PAYTABLE[k][2] };
  });

  const showResult = phase === "idle" && !!spin && !spinning;
  const hasFeature = !!(spin?.freeSpins || spin?.hold);
  const holdWon = spin?.hold && phase === "hold" ? Math.round((spin.hold.start.reduce((a, c) => a + c.x, 0) + spin.hold.respins.slice(0, holdStep).reduce((a, r) => a + r.landed.reduce((b, c) => b + c.x, 0), 0)) * spin.betCents) : 0;
  const deckWin = phase === "fs" ? fsWon + (spin?.hold?.totalWinCents ?? 0) : phase === "hold" ? holdWon : phase === "summary" || (showResult && hasFeature) ? spin?.winCents ?? 0 : showResult ? spin?.baseWinCents ?? 0 : 0;
  const fsTotal = spin?.freeSpins ? spin.freeSpins.spins.length : 0;
  const coinsOnGrid = spin ? spin.coins.flat().filter((x) => x != null).length : 0;

  return (
    <Shell>
      {(u) => {
        balRef.current = u.balanceCents;
        return (
          <div className="slot-page mine-page prairie-page">
            <div className="slot-page-hero">
              <p className="lede">Story video slot · 243 ways · free spins · Hold &amp; Spin</p>
              <h1>Thunderhoof Prairie</h1>
              <p className="muted">243 ways · 5 reels · <button type="button" className="linkish mine-story-link" onClick={() => setStory(true)}>Ada&apos;s story</button></p>
              <MathStrip game="prairie" variant="hero" />
              <p className="math-strip math-strip-hero mine-feature-line">{PRAIRIE_FEATURE_LINE}</p>
            </div>
            <FirstVisitTip game="prairie" />

            <div className="slot-stage-wrap mine-stage pr-stage">
              {inFs && (
                <div className="mine-fs-bar pr-fs-bar" role="status" aria-live="polite">
                  <span className="mine-fs-k">FREE SPINS · 2×/3× WILDS</span>
                  <span>Spin <b>{Math.max(1, fsIdx + 1)}</b> of <b>{fsSpin?.awardedTotal ?? fsTotal}</b></span>
                  <span>Won <b>{money(fsWon)}</b></span>
                  {phase === "fs" && <button type="button" className="btn mine-skip" onClick={skipFree}>Skip to total</button>}
                </div>
              )}
              {phase === "hold" && spin?.hold && (
                <div className="mine-fs-bar pr-fs-bar pr-hold-bar" role="status">
                  <span className="mine-fs-k">HOLD &amp; SPIN</span>
                  <span>New coins reset respins to {PR_HS_RESPINS}</span>
                  {!holdDone && <button type="button" className="btn mine-skip" onClick={skipHold}>Skip to total</button>}
                </div>
              )}
              <PrairieMachine
                ref={machineRef}
                grid={grid}
                coins={coins}
                spinning={spinning}
                winCells={winCells}
                winShows={winShows}
                onSpinComplete={onSpinComplete}
                glow={showResult && spin ? slotGlowTier(coinIn, spin.winCents) : 0}
                glowLive={feelLive}
                turbo={turboOn || phase === "fs"}
                trigger={reduced ? null : trigger}
                freeMode={phase === "fs"}
                hold={phase === "hold" && spin?.hold ? <HoldBoard hold={spin.hold} step={holdStep} betCents={spin.betCents} /> : undefined}
                topper={<CabinetTopper title="Thunderhoof Prairie" kicker="243 ways · Free spins · Hold & Spin" info={<>3+ storm clouds = free spins with 2×/3× wilds · {PR_HS_TRIGGER}+ coins = Hold &amp; Spin · Coin {money(coin)} × {PR_BET_COINS}</>} />}
                belly={<CabinetBelly pays={pays} note={<>5-reel way × coin, per way · MINI {10}× · MINOR {25}× · MAJOR {100}× bet · RTP {(PRAIRIE_MATH.rtp * 100).toFixed(2)}% incl. features</>} />}
                deck={
                  <CabinetDeck
                    creditCents={u.balanceCents}
                    betCents={coinIn}
                    win={ledText(deckWin)}
                    winLit={deckWin > 0}
                    spinning={spinning}
                    busy={busy || phase !== "idle"}
                    canBetDown={coin > SLOT_COIN_MIN}
                    canBetUp={coin < SLOT_COIN_MAX}
                    onBetDown={() => { setCoin((c) => stepCoin(c, -1)); setMaxArmed(false); }}
                    onBetUp={() => { setCoin((c) => stepCoin(c, 1)); setMaxArmed(false); }}
                    onBetOne={() => { setCoin((c) => (c >= SLOT_COIN_MAX ? SLOT_COIN_MIN : stepCoin(c, 1))); setMaxArmed(false); }}
                    onMax={onMaxBet}
                    maxArmed={maxArmed}
                    onSpin={onPrimary}
                    onPayTable={() => document.getElementById("paytable")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    coinLabel={money(coin)}
                    paidCents={paid}
                    maxLabel="Max bet"
                    auto={auto}
                    note="Sandbox / test chips · no cash value · 21+"
                  />
                }
                lever={<CabinetLever onPull={() => void go()} disabled={busy || spinning || auto.running || phase !== "idle"} reduced={reduced} />}
              />
              {phase === "trigger" && trigger && <TriggerBanner kind={trigger} spins={spin?.freeSpins?.initial} coins={coinsOnGrid} reduced={reduced} />}
              {phase === "fs" && retrig > 0 && (
                <div className="mine-trigger pr-trigger still" role="status"><div className="mine-trigger-card"><span className="mine-trigger-k">Retrigger</span><span className="mine-trigger-h">+{retrig} FREE SPINS</span></div></div>
              )}
              {phase === "hold" && holdDone && spin?.hold && (
                <div className="mine-trigger pr-trigger still pr-hold-done" role="status">
                  <div className="mine-trigger-card" style={{ pointerEvents: "auto" }}>
                    <span className="mine-trigger-k">{spin.hold.full ? "Full screen!" : "Round-up complete"}</span>
                    <span className="mine-trigger-h">{money(spin.hold.totalWinCents)}</span>
                    <span className="mine-trigger-s">{spin.hold.board.filter((v) => v != null).length} coins · {spin.hold.totalX}× bet</span>
                    <button type="button" className="btn primary" onClick={afterHold} autoFocus>{spin.freeSpins ? "On to free spins" : "Collect"}</button>
                  </div>
                </div>
              )}
            </div>

            {phase === "summary" && spin && (
              <div className="mine-modal pr-modal" role="dialog" aria-modal="true" aria-labelledby="pr-sum-h">
                <div className="mine-modal-card mine-summary">
                  <p className="mine-kicker">Feature complete</p>
                  <h2 id="pr-sum-h">{money(spin.winCents)}</h2>
                  <table className="mine-sum-table">
                    <tbody>
                      <tr><td>Base spin</td><td>{money(spin.baseWinCents)}</td></tr>
                      {spin.hold && <tr><td>Hold &amp; Spin ({spin.hold.board.filter((v) => v != null).length} coins, {spin.hold.totalX}× bet)</td><td>{money(spin.hold.totalWinCents)}</td></tr>}
                      {spin.freeSpins && <tr><td>Free spins ({spin.freeSpins.spins.length} played)</td><td>{money(spin.freeSpins.totalWinCents)}</td></tr>}
                      <tr className="mine-sum-total"><td>Total on a {money(spin.betCents)} bet</td><td>{money(spin.winCents)}</td></tr>
                    </tbody>
                  </table>
                  {spin.freeSpins?.capped && <p className="muted">This feature reached the {PR_FS_CAP}-free-spin cap.</p>}
                  <p className="muted">Already credited to your sandbox balance by the server.</p>
                  <button type="button" className="btn primary" onClick={finishFeature} autoFocus>Back to the reels</button>
                </div>
              </div>
            )}

            {showResult && spin && !hasFeature && spin.winCents > coinIn && (
              <OutcomeBanner win title="YOU WIN" amountCents={spin.winCents} stakeCents={coinIn} subtitle={`${money(spin.winCents)} back on a ${money(coinIn)} bet · net +${money(spin.winCents - coinIn)}`} />
            )}
            {showResult && spin && !hasFeature && spin.winCents > 0 && spin.winCents <= coinIn && (
              <OutcomeBanner push title={spin.winCents === coinIn ? "BET BACK" : "PART BACK"} amountCents={spin.winCents} stakeCents={coinIn} subtitle={spin.winCents === coinIn ? `${money(spin.winCents)} back · net $0.00` : `${money(spin.winCents)} back on a ${money(coinIn)} bet · net −${money(coinIn - spin.winCents)}`} />
            )}
            {showResult && spin && !hasFeature && spin.winCents === 0 && <OutcomeBanner quiet title="NO WAY" subtitle="You lose this spin." />}
            {showResult && spin && hasFeature && (
              <OutcomeBanner win title="FEATURE WIN" amountCents={spin.winCents} stakeCents={coinIn} subtitle={`${money(spin.winCents)} back on a ${money(coinIn)} bet, features included`} />
            )}

            <div className="panel mine-info" id="paytable" style={{ marginTop: 20 }}>
              <h3>Paytable (× coin, per way)</h3>
              <table className="paytable">
                <thead><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr></thead>
                <tbody>
                  {(Object.keys(PR_PAYTABLE) as PrPaySymbol[]).map((k) => {
                    const a = PR_SYM_ART[k]; const I = a.Svg; const v = PR_PAYTABLE[k];
                    return <tr key={k}><td className="pt-sym"><span className={`pt-art tone-${a.tone}`} aria-hidden><I /></span><span>{a.label}</span></td><td>{v[0]}</td><td>{v[1]}</td><td>{v[2]}</td></tr>;
                  })}
                </tbody>
              </table>
              <h4>Features</h4>
              <ul className="mine-rules">
                <li><b>243 ways</b>: a symbol pays when it lands anywhere on reels 1, 2 and 3 (and 4, 5) in a row from the left. Each matching cell is a separate way: 2 buffalo on reel 1 × 1 on reel 2 × 2 on reel 3 = 4 ways. Only the longest run of each symbol pays. A spin costs {PR_BET_COINS} coins.</li>
                <li><b>Wild</b> (prairie sunset) lands on reels 2–4 and stands in for every pay symbol, not storms or coins.</li>
                <li><b>Storm</b> clouds pay anywhere: 3 / 4 / 5 pay {PR_SCATTER_PAY[3]}× / {PR_SCATTER_PAY[4]}× / {PR_SCATTER_PAY[5]}× the total bet and award {PR_FS_AWARD[3]} / {PR_FS_AWARD[4]} / {PR_FS_AWARD[5]} free spins.</li>
                <li><b>Free spins</b> use the same reels and bet, but each wild is printed as a <b>2×</b> or <b>3×</b> wild. A way through wilds is multiplied by every wild on it (two 3× wilds = 9×, up to 27×). 3+ storms during free spins add the same awards again, up to {PR_FS_CAP} free spins per feature. Coins rest during free spins.</li>
                <li><b>Hold &amp; Spin</b>: {PR_HS_TRIGGER} or more coins anywhere in the base game. Coins lock and you get {PR_HS_RESPINS} respins; each empty spot lands a coin {PR_HS_Q_PERMILLE / 10}% of the time per respin, and any new coin resets the respins to {PR_HS_RESPINS}. The round ends at 0 respins or a full screen, and pays the total of every coin.</li>
                <li><b>Coin values</b> (× total bet, fixed, no progressive): {PR_COIN_VALUES.map((v) => `${v.label ? v.label + " " : ""}${v.x}× (${(v.w / 10).toFixed(1)}%)`).join(" · ")}.</li>
                <li><b>Honest replay</b>: the server decides the spin, every free spin and every respin before anything is shown, and pays it all in one transaction. Skipping only skips the animation.</li>
              </ul>
              <MathStrip game="prairie" variant="panel" />
              <p className="muted">
                Exact theoretical RTP {(PRAIRIE_MATH.rtp * 100).toFixed(2)}%: base game {(PRAIRIE_MATH.baseRtp * 100).toFixed(2)}% (ways {(PRAIRIE_MATH.waysRtp * 100).toFixed(2)}% + storm {(PRAIRIE_MATH.scatterRtp * 100).toFixed(2)}%),
                free spins {(PRAIRIE_MATH.freeSpinsRtp * 100).toFixed(2)}%, Hold &amp; Spin {(PRAIRIE_MATH.holdRtp * 100).toFixed(2)}%. Hit rate {(PRAIRIE_MATH.hitRate * 100).toFixed(1)}% (any return or feature).
                {" "}{PRAIRIE_FEATURE_LINE}. A free-spins feature averages {PRAIRIE_MATH.freeSpinsPerFeature.toFixed(2)} spins and {PRAIRIE_MATH.freeSpinFeatureX.toFixed(1)}× bet; a Hold &amp; Spin averages {PRAIRIE_MATH.holdFeatureX.toFixed(1)}× bet.
                Computed from the reel strips and confirmed by a 10-million-spin simulation of the server code.
              </p>
            </div>

            <div className="rl-tools">
              <label className="rl-toggle">
                <input type="checkbox" checked={turboOn} onChange={(e) => setTurbo(e.target.checked)} disabled={reduced} />
                {" "}Turbo spin
              </label>
              {reduced && <span className="muted">Reduced motion: faster reel settles, no flashing</span>}
            </div>

            <ActionDock hint={phase === "fs" ? "Free spins playing · Skip to total any time" : phase === "hold" ? "Hold & Spin playing" : spinning ? "Stop · or tap a reel · reels in motion…" : "Pick a coin size, then Spin."} busy={busy || spinning || phase !== "idle"}>
              <SpinNotice msg={err} onClose={() => setErr(null)} />
              <QuickBetRow
                amounts={SLOT_COIN_CHIPS}
                selected={coin}
                onSelect={setCoin}
                lastCoinCents={lastCoin}
                balanceCents={u.balanceCents}
                busy={busy || spinning || auto.running || phase !== "idle"}
                onRepeat={(c) => { setCoin(c); void go(c); }}
                minCents={SLOT_COIN_MIN}
                maxCents={SLOT_COIN_MAX}
              />
              <button type="button" className="btn primary hero-act" disabled={(busy && !spinning) || (phase !== "idle" && phase !== "spinning" && phase !== "fs")} onClick={onPrimary} aria-label={spinning ? "Stop reels" : `Spin for ${money(coinIn)}`}>
                {spinning ? "Stop" : `Spin · ${money(coinIn)}`}
              </button>
            </ActionDock>

            {story && <StoryCard onClose={closeStory} />}
          </div>
        );
      }}
    </Shell>
  );
}
