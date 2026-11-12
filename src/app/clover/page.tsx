"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Shell from "@/components/Shell";
import CloverMachine, { CL_SYM_ART, type CloverMachineHandle, type WinCell } from "@/components/CloverMachine";
import { OrlaPortrait } from "@/components/CloverSymbols";
import RainbowWheel, { type WheelResult } from "@/components/RainbowWheel";
import { ActionDock, OutcomeBanner, FirstVisitTip, useClearErrOnBalance } from "@/components/TableUX";
import { MathStrip } from "@/components/VolatilityMeter";
import { api, money, useUser } from "@/components/useUser";
import { lineShows, scatterShow, freeSpinShows } from "@/lib/winShow";
import { CL_PAYLINES, CL_PAYTABLE, CL_FS_AWARD, CL_FS_CAP, CL_SCATTER_PAY, CL_BET_COINS, CL_INNER_WHEEL, CL_OUTER_WHEEL, CL_WHEEL_FS, type ClSymbol, type ClPaySymbol, type Wedge } from "@/lib/games/clover";
import { CLOVER_MATH, CLOVER_FEATURE_LINE } from "@/lib/gameMath";
import { slotGlowTier, soundOn, reducedMotion, playSpin, playFeature } from "@/lib/feel";
import { SLOT_TURBO_KEY, slotTurboEffective } from "@/lib/slotFeel";
import QuickBetRow, { useLastBet } from "@/components/QuickBet";
import { SLOT_COIN_CHIPS, SLOT_COIN_MAX, SLOT_COIN_MIN } from "@/lib/quickBet";
import { CabinetBelly, CabinetDeck, CabinetLever, CabinetTopper, useAutoSpin } from "@/components/SlotCabinet";
import { ledText, stepCoin, maxBetCoin, maxBetRefusal } from "@/lib/cabinet";
import SpinNotice from "@/components/SpinNotice";

type LineWin = { line: number; symbol: string; count: number; pay: number; winCents: number };
type FreeSpin = { n: number; grid: ClSymbol[][]; shown: ClSymbol[][]; lineWins: LineWin[]; scatters: number; winCents: number; retrigger: number; awardedTotal: number };
type FreeSpins = { initial: number; source: "kettle" | "wheel"; spins: FreeSpin[]; totalWinCents: number; capped: boolean };
type Wheel = WheelResult & { freeSpins: FreeSpins | null };
type Spin = {
  id: string; coinCents: number; betCents: number; grid: ClSymbol[][]; lineWins: LineWin[];
  scatters: number; scatterWinCents: number; baseWinCents: number; winCents: number;
  wheel: Wheel | null; freeSpins: FreeSpins | null;
};
type Phase = "idle" | "spinning" | "trigger" | "wheel" | "fs" | "summary";
type Step = { kind: "wheel" } | { kind: "fs"; fs: FreeSpins };

const STORY_KEY = "pit_story_v1:clover";
const wedgeText = (w: Wedge) => (w.kind === "credit" ? `${w.x}×` : w.kind === "fs" ? `${w.spins} free spins` : "Upgrade");

function cellsFor(grid: ClSymbol[][] | null, lineWins: LineWin[] | undefined, extra: ClSymbol[] = []): WinCell[] {
  const out: WinCell[] = [];
  const seen = new Set<string>();
  const add = (reel: number, row: number) => { const k = `${reel}-${row}`; if (!seen.has(k)) { seen.add(k); out.push({ reel, row }); } };
  for (const w of lineWins ?? []) { const pat = CL_PAYLINES[w.line]; if (pat) for (let r = 0; r < w.count && r < 5; r++) add(r, pat[r]!); }
  if (grid) grid.forEach((col, r) => col.forEach((s, row) => { if (extra.includes(s)) add(r, row); }));
  return out;
}
const steps = (s: Spin): Step[] => [
  ...(s.wheel ? [{ kind: "wheel" } as Step] : []),
  ...(s.wheel?.freeSpins ? [{ kind: "fs", fs: s.wheel.freeSpins } as Step] : []),
  ...(s.freeSpins ? [{ kind: "fs", fs: s.freeSpins } as Step] : []),
];

function StoryCard({ onClose }: { onClose: () => void }) {
  return (
    <div className="mine-modal cl-modal" role="dialog" aria-modal="true" aria-labelledby="cl-story-h">
      <div className="mine-modal-card mine-story cl-story">
        <OrlaPortrait size={112} />
        <p className="mine-kicker">The story</p>
        <h2 id="cl-story-h">Orla Tully&apos;s Copper Kettle</h2>
        <p>
          Orla Tully mends boots for the fair folk of Glenmoss and keeps her wages in a copper kettle at the far end of the rainbow bridge.
          Bramble the hare keeps watch. Folk who find three rainbow bridges get to spin Orla&apos;s Rainbow Wheel, and a lucky UPGRADE
          sends you out to the great Pot-of-Gold wheel.
        </p>
        <p>
          Three copper kettles start free spins, where every four-leaf clover that lands spreads across its whole reel.
        </p>
        <p className="mine-story-note">Sandbox / test chips only · no cash value · 21+. Every result, including each wheel stop, is drawn by the server; features don&apos;t change the odds of the next spin.</p>
        <button type="button" className="btn primary" onClick={onClose} autoFocus>Cross the bridge</button>
      </div>
    </div>
  );
}

function TriggerBanner({ kind, spins, source, reduced }: { kind: "fs" | "wheel"; spins?: number; source?: string; reduced: boolean }) {
  return (
    <div className={`mine-trigger cl-trigger cl-trigger-${kind}${reduced ? " still" : ""}`} role="status" aria-live="assertive">
      <div className="mine-trigger-card">
        {kind === "fs" ? (
          <>
            <span className="mine-trigger-k">{source === "wheel" ? "From the wheel" : "Three kettles!"}</span>
            <span className="mine-trigger-h">{spins} FREE SPINS</span>
            <span className="mine-trigger-s">Clover wilds expand to fill their reel</span>
          </>
        ) : (
          <>
            <span className="mine-trigger-k">Rainbow bridges on reels 1, 3 &amp; 5</span>
            <span className="mine-trigger-h">RAINBOW WHEEL</span>
            <span className="mine-trigger-s">Credits · free spins · or upgrade to the Pot-of-Gold wheel</span>
          </>
        )}
      </div>
    </div>
  );
}

export default function CloverPage() {
  const { setUser } = useUser();
  const [spin, setSpin] = useState<Spin | null>(null);
  const [grid, setGrid] = useState<ClSymbol[][] | null>(null);
  const [coin, setCoin] = useState(25);
  const [err, setErr] = useState<string | null>(null);
  useClearErrOnBalance(setErr);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const setPh = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  const [trigger, setTrigger] = useState<"fs" | "wheel" | null>(null);
  const [fsCur, setFsCur] = useState<FreeSpins | null>(null);
  const fsRef = useRef<FreeSpins | null>(null);
  const [fsIdx, setFsIdx] = useState(-1);
  const fsIdxRef = useRef(-1);
  const [fsWon, setFsWon] = useState(0);
  const [fsShown, setFsShown] = useState(false);
  const [retrig, setRetrig] = useState(0);
  const stepRef = useRef(0);
  const [story, setStory] = useState(false);
  const [paid, setPaid] = useState(0);
  const [lastCoin, rememberCoin] = useLastBet("clover");
  const [feelLive, setFeelLive] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [maxArmed, setMaxArmed] = useState(false);
  const machineRef = useRef<CloverMachineHandle>(null);
  const spinRef = useRef<Spin | null>(null);
  spinRef.current = spin;
  const balRef = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

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

  const coinIn = coin * CL_BET_COINS;
  const [settleTick, setSettleTick] = useState(0);
  const auto = useAutoSpin({
    settleTick,
    spinOnce: () => void go(),
    balanceCents: useCallback(() => balRef.current, []),
    costCents: coinIn,
    jackpot: useCallback(() => !!(spinRef.current?.freeSpins || spinRef.current?.wheel), []),
  });

  const fsSpin: FreeSpin | null = fsCur && fsIdx >= 0 ? fsCur.spins[fsIdx] ?? null : null;

  const winLines = useMemo(() => {
    if (spinning) return [];
    if (phase === "fs" && fsSpin && fsShown) return fsSpin.lineWins.map((w) => w.line);
    if (phase === "idle" || phase === "trigger") return (spin?.lineWins ?? []).map((w) => w.line);
    return [];
  }, [spin, spinning, phase, fsSpin, fsShown]);

  const winShows = useMemo(() => {
    if (spinning) return [];
    if (phase === "fs" && fsSpin && fsShown) return freeSpinShows(fsSpin.grid, fsSpin.lineWins, CL_PAYLINES, "KETTLE", "KETTLE scatter", fsSpin.winCents, 1);
    if (phase === "idle" && spin) return [...lineShows(spin.lineWins, CL_PAYLINES), ...scatterShow(spin.grid, "KETTLE", spin.scatterWinCents, "KETTLE scatter")];
    return [];
  }, [spin, spinning, phase, fsSpin, fsShown]);

  const winCells = useMemo(() => {
    if (spinning) return [];
    if (phase === "fs" && fsSpin && fsShown) return cellsFor(fsSpin.grid, fsSpin.lineWins, fsSpin.retrigger ? ["KETTLE"] : []);
    if (phase === "trigger" && trigger) return cellsFor(spin?.grid ?? null, [], trigger === "fs" ? ["KETTLE"] : ["RAINBOW"]);
    if (phase === "idle" && spin) return cellsFor(spin.grid, spin.lineWins, spin.scatters >= 3 ? ["KETTLE"] : []);
    return [];
  }, [spin, spinning, phase, fsSpin, fsShown, trigger]);

  const expandReels = useMemo(() => (phase === "fs" && fsSpin && fsShown ? [1, 2, 3].filter((r) => fsSpin.grid[r]!.includes("WILD")) : []), [phase, fsSpin, fsShown]);

  const playNextFree = useCallback((idx: number) => {
    const f = fsRef.current;
    if (!f) return;
    if (idx >= f.spins.length) { runStep(stepRef.current + 1); return; }
    fsIdxRef.current = idx;
    setFsIdx(idx);
    setFsShown(false);
    setRetrig(0);
    setGrid(null);
    setSpinning(true);
    playSpin();
    later(() => setGrid(f.spins[idx]!.grid), 180);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runStep = useCallback((i: number) => {
    const s = spinRef.current;
    if (!s) return;
    const list = steps(s);
    stepRef.current = i;
    if (i >= list.length) { setPh("summary"); return; }
    const st = list[i]!;
    setTrigger(st.kind);
    if (st.kind === "fs") { fsRef.current = st.fs; setFsCur(st.fs); setFsIdx(-1); }
    setPh("trigger");
    playFeature();
    later(() => {
      setTrigger(null);
      if (st.kind === "wheel") setPh("wheel");
      else { setPh("fs"); setFsWon(0); playNextFree(0); }
    }, reducedMotion() ? 900 : 2000);
  }, [playNextFree]);

  const onSpinComplete = useCallback(() => {
    setSpinning(false);
    const s = spinRef.current;
    if (phaseRef.current === "fs" && fsRef.current) {
      const fsp = fsRef.current.spins[fsIdxRef.current]!;
      setFsShown(true);
      setFsWon((w) => w + fsp.winCents);
      const expands = [1, 2, 3].some((r) => fsp.grid[r]!.includes("WILD"));
      const gap = reducedMotion() ? 450 : (fsp.winCents > 0 ? 1200 : 650) + (expands ? 500 : 0);
      if (fsp.retrigger > 0) {
        setRetrig(fsp.retrigger);
        playFeature();
        later(() => playNextFree(fsIdxRef.current + 1), gap + 1400);
      } else later(() => playNextFree(fsIdxRef.current + 1), gap);
      return;
    }
    setBusy(false);
    if (s && steps(s).length) {
      if (auto.running) auto.cancel();
      runStep(0);
      return;
    }
    setPaid((v) => v + (s?.winCents ?? 0));
    setPh("idle");
    setSettleTick((n) => n + 1);
  }, [playNextFree, runStep, auto]);

  function skipFree() {
    const f = fsRef.current;
    if (!f) return;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setSpinning(false);
    setFsWon(f.totalWinCents);
    setFsIdx(f.spins.length - 1);
    fsIdxRef.current = f.spins.length - 1;
    runStep(stepRef.current + 1);
  }

  function finishFeature() {
    setPaid((v) => v + (spinRef.current?.winCents ?? 0));
    setPh("idle");
    setFsIdx(-1);
    fsIdxRef.current = -1;
    fsRef.current = null;
    setFsCur(null);
    if (spinRef.current) setGrid(spinRef.current.grid);
    setSettleTick((n) => n + 1);
  }

  async function go(coinOverride?: number) {
    if (busy || spinning || phaseRef.current !== "idle") return;
    const c = coinOverride ?? coin;
    if (balRef.current < c * CL_BET_COINS) {
      setErr(`This spin costs ${money(c * CL_BET_COINS)} (coin × ${CL_BET_COINS}). Add sandbox chips in the Cage.`);
      auto.fail();
      return;
    }
    setErr(null);
    setMaxArmed(false);
    setBusy(true);
    setSpin(null);
    setGrid(null);
    setSpinning(true);
    setPh("spinning");
    playSpin();
    try {
      const d = await api("/api/games/clover", { method: "POST", body: JSON.stringify({ coinCents: c, idempotencyKey: crypto.randomUUID() }) });
      rememberCoin(c);
      setSpin(d.spin);
      spinRef.current = d.spin;
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
    const best = maxBetCoin(balRef.current, CL_BET_COINS, SLOT_COIN_MIN, SLOT_COIN_MAX);
    if (best === null) { setMaxArmed(false); setErr(maxBetRefusal(money(balRef.current), money(SLOT_COIN_MIN * CL_BET_COINS))); return; }
    if (!maxArmed) { setMaxArmed(true); return; }
    setCoin(best);
    setMaxArmed(false);
    setErr(null);
  }

  const pays = (["HAT", "HARP", "FIDDLE", "TOADSTOOL"] as ClPaySymbol[]).map((k) => {
    const a = CL_SYM_ART[k];
    return { key: k, label: a.label, tone: a.tone, Svg: a.Svg, pay5: CL_PAYTABLE[k][2] };
  });

  const showResult = phase === "idle" && !!spin && !spinning;
  const hasFeature = !!(spin?.freeSpins || spin?.wheel);
  const deckWin = phase === "fs" ? fsWon : phase === "summary" || (showResult && hasFeature) ? spin?.winCents ?? 0 : showResult ? spin?.baseWinCents ?? 0 : 0;

  return (
    <Shell>
      {(u) => {
        balRef.current = u.balanceCents;
        return (
          <div className="slot-page mine-page clover-page">
            <div className="slot-page-hero">
              <p className="lede">Story video slot · Rainbow Wheel · expanding-wild free spins</p>
              <h1>Kettle of Clover</h1>
              <p className="muted">10 lines · 5 reels · <button type="button" className="linkish mine-story-link" onClick={() => setStory(true)}>Orla&apos;s story</button></p>
              <MathStrip game="clover" variant="hero" />
              <p className="math-strip math-strip-hero mine-feature-line">{CLOVER_FEATURE_LINE}</p>
            </div>
            <FirstVisitTip game="clover" />

            <div className="slot-stage-wrap mine-stage cl-stage">
              {phase === "fs" && fsCur && (
                <div className="mine-fs-bar cl-fs-bar" role="status" aria-live="polite">
                  <span className="mine-fs-k">FREE SPINS · EXPANDING CLOVERS</span>
                  <span>Spin <b>{Math.max(1, fsIdx + 1)}</b> of <b>{fsSpin?.awardedTotal ?? fsCur.initial}</b></span>
                  <span>Won <b>{money(fsWon)}</b></span>
                  <button type="button" className="btn mine-skip" onClick={skipFree}>Skip to total</button>
                </div>
              )}
              <CloverMachine
                ref={machineRef}
                grid={grid}
                spinning={spinning}
                winCells={winCells}
                winShows={winShows}
                onSpinComplete={onSpinComplete}
                glow={showResult && spin ? slotGlowTier(coinIn, spin.winCents) : 0}
                glowLive={feelLive}
                turbo={turboOn || phase === "fs"}
                winLines={winLines}
                trigger={reduced ? null : trigger}
                freeMode={phase === "fs"}
                expandReels={expandReels}
                topper={<CabinetTopper title="Kettle of Clover" kicker="Rainbow Wheel · Free spins · 10 lines" info={<>Rainbows on reels 1, 3 &amp; 5 = Rainbow Wheel · 3+ kettles = free spins with expanding clovers · Coin {money(coin)} × {CL_BET_COINS} lines</>} />}
                belly={<CabinetBelly pays={pays} note={<>5 of a kind × coin · wheel up to 250× bet · RTP {(CLOVER_MATH.rtp * 100).toFixed(2)}% incl. features</>} />}
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
              {phase === "trigger" && trigger && <TriggerBanner kind={trigger} spins={fsCur?.initial} source={fsCur?.source} reduced={reduced} />}
              {phase === "fs" && retrig > 0 && (
                <div className="mine-trigger cl-trigger still" role="status"><div className="mine-trigger-card"><span className="mine-trigger-k">Retrigger</span><span className="mine-trigger-h">+{retrig} FREE SPINS</span></div></div>
              )}
            </div>

            {phase === "wheel" && spin?.wheel && <RainbowWheel wheel={spin.wheel} betCents={spin.betCents} reduced={reduced} onDone={() => runStep(stepRef.current + 1)} />}

            {phase === "summary" && spin && (
              <div className="mine-modal cl-modal" role="dialog" aria-modal="true" aria-labelledby="cl-sum-h">
                <div className="mine-modal-card mine-summary">
                  <p className="mine-kicker">Feature complete</p>
                  <h2 id="cl-sum-h">{money(spin.winCents)}</h2>
                  <table className="mine-sum-table">
                    <tbody>
                      <tr><td>Base spin</td><td>{money(spin.baseWinCents)}</td></tr>
                      {spin.wheel && <tr><td>Rainbow Wheel ({spin.wheel.outer !== null ? `upgrade → ${wedgeText(spin.wheel.result)}` : wedgeText(spin.wheel.result)})</td><td>{money(spin.wheel.creditWinCents)}</td></tr>}
                      {spin.wheel?.freeSpins && <tr><td>Wheel free spins ({spin.wheel.freeSpins.spins.length} played)</td><td>{money(spin.wheel.freeSpins.totalWinCents)}</td></tr>}
                      {spin.freeSpins && <tr><td>Kettle free spins ({spin.freeSpins.spins.length} played)</td><td>{money(spin.freeSpins.totalWinCents)}</td></tr>}
                      <tr className="mine-sum-total"><td>Total on a {money(spin.betCents)} bet</td><td>{money(spin.winCents)}</td></tr>
                    </tbody>
                  </table>
                  {(spin.freeSpins?.capped || spin.wheel?.freeSpins?.capped) && <p className="muted">A feature reached the {CL_FS_CAP}-free-spin cap.</p>}
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
            {showResult && spin && !hasFeature && spin.winCents === 0 && <OutcomeBanner title="NO LINE" subtitle="You lose this spin." />}
            {showResult && spin && hasFeature && (
              <OutcomeBanner win title="FEATURE WIN" amountCents={spin.winCents} stakeCents={coinIn} subtitle={`${money(spin.winCents)} back on a ${money(coinIn)} bet, features included`} />
            )}

            <div className="panel mine-info" id="paytable" style={{ marginTop: 20 }}>
              <h3>Paytable (per line, × coin)</h3>
              <table className="paytable">
                <thead><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr></thead>
                <tbody>
                  {(Object.keys(CL_PAYTABLE) as ClPaySymbol[]).map((k) => {
                    const a = CL_SYM_ART[k]; const I = a.Svg; const v = CL_PAYTABLE[k];
                    return <tr key={k}><td className="pt-sym"><span className={`pt-art tone-${a.tone}`} aria-hidden><I /></span><span>{a.label}</span></td><td>{v[0]}</td><td>{v[1]}</td><td>{v[2]}</td></tr>;
                  })}
                </tbody>
              </table>
              <h4>Features</h4>
              <ul className="mine-rules">
                <li><b>Wild</b> (four-leaf clover) lands on reels 2–4 and stands in for every pay symbol, not kettles or rainbows.</li>
                <li><b>Kettles</b> pay anywhere: 3 / 4 / 5 pay {CL_SCATTER_PAY[3]}× / {CL_SCATTER_PAY[4]}× / {CL_SCATTER_PAY[5]}× the total bet and award {CL_FS_AWARD[3]} / {CL_FS_AWARD[4]} / {CL_FS_AWARD[5]} free spins.</li>
                <li><b>Free spins</b> use the same reels and bet. Any clover wild that lands on reels 2–4 <b>expands to fill its whole reel</b> before lines are paid. 3+ kettles (counted as they land) add the same awards again, up to {CL_FS_CAP} free spins per feature. Rainbows do nothing during free spins.</li>
                <li><b>Rainbow Wheel</b>: a rainbow bridge on each of reels 1, 3 and 5 (any row). 12 equal wedges: {CL_INNER_WHEEL.map(wedgeText).join(", ")}. {CL_WHEEL_FS} free spins play exactly like kettle free spins.</li>
                <li><b>Pot-of-Gold Wheel</b> (reached by UPGRADE): 12 equal wedges: {CL_OUTER_WHEEL.map(wedgeText).join(", ")}. Average Rainbow Wheel prize {CLOVER_MATH.wheelExpectedX.toFixed(1)}× bet including free spins and upgrades.</li>
                <li><b>Honest wheel</b>: the server picks the wedge (every wedge equally likely) when the rainbows land and pays it in the same transaction. The wheel animation is told where to stop; tapping Spin doesn&apos;t change it.</li>
              </ul>
              <MathStrip game="clover" variant="panel" />
              <p className="muted">
                Exact theoretical RTP {(CLOVER_MATH.rtp * 100).toFixed(2)}%: base game {(CLOVER_MATH.baseRtp * 100).toFixed(2)}% (lines {(CLOVER_MATH.lineRtp * 100).toFixed(2)}% + kettles {(CLOVER_MATH.scatterRtp * 100).toFixed(2)}%),
                kettle free spins {(CLOVER_MATH.freeSpinsRtp * 100).toFixed(2)}%, Rainbow Wheel {(CLOVER_MATH.wheelRtp * 100).toFixed(2)}% (including its free spins). Hit rate {(CLOVER_MATH.hitRate * 100).toFixed(1)}% (any return or feature).
                {" "}{CLOVER_FEATURE_LINE}. A kettle free-spins feature averages {CLOVER_MATH.freeSpinsPerFeature.toFixed(2)} spins and {CLOVER_MATH.freeSpinFeatureX.toFixed(1)}× bet.
                Computed from the reel strips and wheel wedges and confirmed by a 10-million-spin simulation of the server code.
              </p>
            </div>

            <div className="rl-tools">
              <label className="rl-toggle">
                <input type="checkbox" checked={turboOn} onChange={(e) => setTurbo(e.target.checked)} disabled={reduced} />
                {" "}Turbo spin
              </label>
              {reduced && <span className="muted">Reduced motion: faster reel settles, no flashing, wheel stops at once</span>}
            </div>

            <ActionDock hint={phase === "fs" ? "Free spins playing · Skip to total any time" : phase === "wheel" ? "Rainbow Wheel" : spinning ? "Stop · or tap a reel · reels in motion…" : "Pick a coin size, then Spin."} busy={busy || spinning || phase !== "idle"}>
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
