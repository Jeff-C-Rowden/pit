"use client";
import { celebrationFor } from "@/lib/winCelebration";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Shell from "@/components/Shell";
import MineMachine, { MINE_SYM_ART, type MineMachineHandle, type WinCell } from "@/components/MineMachine";
import { ClemPortrait, MineCart } from "@/components/MineSymbols";
import { ActionDock, OutcomeBanner, FirstVisitTip, useClearErrOnBalance } from "@/components/TableUX";
import { MathStrip } from "@/components/VolatilityMeter";
import { api, money, useUser } from "@/components/useUser";
import { lineShows, scatterShow, freeSpinShows } from "@/lib/winShow";
import { MINE_PAYLINES, MINE_FS_MULT, MINE_PAYTABLE, MINE_FS_AWARD, MINE_FS_CAP, MINE_PICK_CARTS, MINE_PICK_PRIZES, MINE_SCATTER_PAY, type MineSymbol, type CartItem } from "@/lib/games/mine";
import { MINE_MATH, MINE_FEATURE_LINE } from "@/lib/gameMath";
import { soundOn, reducedMotion, playSpin, playFeature } from "@/lib/feel";
import { SLOT_TURBO_KEY, slotTurboEffective } from "@/lib/slotFeel";
import QuickBetRow, { useLastBet } from "@/components/QuickBet";
import { SLOT_COIN_CHIPS, SLOT_COIN_MAX, SLOT_COIN_MIN } from "@/lib/quickBet";
import { CabinetBelly, CabinetDeck, CabinetLever, CabinetTopper, useAutoSpin } from "@/components/SlotCabinet";
import { useSpinRecap } from "@/components/SpinRecap";
import { ledText, stepCoin, maxBetCoin, maxBetRefusal } from "@/lib/cabinet";
import SpinNotice from "@/components/SpinNotice";
import { BonusIntroCard, BonusSummaryCard, useFeatureCredit } from "@/components/BonusBookend";
import { bonusIntro, mineSummary } from "@/lib/bonusBookends";
import { FS_SAVE_EVERY, RESUME_NOTE } from "@/lib/featureResume";
import { mineResumeWhere, minePickedCarts, wonBefore, type MineProgress } from "@/lib/featureResumeSlots";

type LineWin = { line: number; symbol: string; count: number; pay: number; winCents: number };
type FreeSpin = { n: number; grid: MineSymbol[][]; lineWins: LineWin[]; scatters: number; winCents: number; retrigger: number; awardedTotal: number };
type Spin = {
  id: string; coinCents: number; betCents: number; grid: MineSymbol[][]; lineWins: LineWin[];
  scatters: number; scatterWinCents: number; baseWinCents: number; winCents: number;
  freeSpins: { initial: number; spins: FreeSpin[]; totalWinCents: number; capped: boolean } | null;
  pick: { reveals: CartItem[]; totalX: number; totalWinCents: number } | null;
};
type Phase = "idle" | "spinning" | "trigger" | "pick" | "fs" | "summary" | "resume";

const STORY_KEY = "pit_story_v1:mine";

function cellsFor(grid: MineSymbol[][] | null, lineWins: LineWin[] | undefined, extra: MineSymbol[] = []): WinCell[] {
  const out: WinCell[] = [];
  const seen = new Set<string>();
  const add = (reel: number, row: number) => { const k = `${reel}-${row}`; if (!seen.has(k)) { seen.add(k); out.push({ reel, row }); } };
  for (const w of lineWins ?? []) {
    const pat = MINE_PAYLINES[w.line];
    if (pat) for (let r = 0; r < w.count && r < 5; r++) add(r, pat[r]!);
  }
  if (grid) grid.forEach((col, r) => col.forEach((s, row) => { if (extra.includes(s)) add(r, row); }));
  return out;
}

function StoryCard({ onClose }: { onClose: () => void }) {
  return (
    <div className="mine-modal" role="dialog" aria-modal="true" aria-labelledby="mine-story-h">
      <div className="mine-modal-card mine-story">
        <ClemPortrait size={112} />
        <p className="mine-kicker">The story</p>
        <h2 id="mine-story-h">Clem &amp; Pip of Canary Creek</h2>
        <p>
          Clementine &ldquo;Clem&rdquo; Hollis stayed on at Canary Creek after the boom went quiet, with Pip the canary riding on her lamp hat.
          When three sticks of dynamite light up, Clem blasts open a fresh seam of free spins, and when mine carts roll in on reels 1, 3 and 5 she lets you pick through the ore.
        </p>
        <p className="mine-story-note">Sandbox / test chips only · no cash value · 21+. Every result is drawn by the server; features don&apos;t change the odds of the next spin.</p>
        <button type="button" className="btn primary" onClick={onClose} autoFocus>Head into the mine</button>
      </div>
    </div>
  );
}

/**
 * Mine Cart pick, replayed from the server's reveal order. `opened` lists the carts tapped so far, in order:
 * the k-th cart opened always shows reveals[k]. A resumed round (research #5) starts with the carts that were
 * already open before the refresh; `onOpen` reports every new cart so the server can save the place.
 */
function PickBoard({ pick, betCents, onDone, reduced, initialOpened = [], onOpen }: { pick: NonNullable<Spin["pick"]>; betCents: number; onDone: () => void; reduced: boolean; initialOpened?: number[]; onOpen?: (opened: number[]) => void }) {
  const [opened, setOpened] = useState<number[]>(() => initialOpened.slice(0, pick.reveals.length));
  const assigned: Record<number, CartItem> = {};
  opened.forEach((cart, k) => { assigned[cart] = pick.reveals[k]!; });
  const done = opened.length >= pick.reveals.length;
  const runningX = opened.reduce((a, _c, k) => { const it = pick.reveals[k]!; return a + (it.kind === "prize" ? it.x : 0); }, 0);
  const commit = (next: number[]) => { setOpened(next); onOpen?.(next); };
  const reveal = (cart: number) => {
    if (done || assigned[cart]) return;
    commit([...opened, cart]);
  };
  const revealAll = () => {
    const next = [...opened];
    for (let c = 0; c < MINE_PICK_CARTS && next.length < pick.reveals.length; c++) if (!next.includes(c)) next.push(c);
    commit(next);
  };
  return (
    <div className="mine-modal" role="dialog" aria-modal="true" aria-labelledby="mine-pick-h">
      <div className="mine-modal-card mine-pick">
        <p className="mine-kicker">Bonus</p>
        <h2 id="mine-pick-h">Mine Cart Pick</h2>
        <p className="mine-pick-sub">Tap a cart. Prizes add up until a lamp says <b>COLLECT</b>. The first cart always holds ore.</p>
        <div className="mine-pick-total" aria-live="polite">
          <span>Bonus total</span>
          <b>{money(runningX * betCents)}</b>
          <span className="muted">{runningX}× bet</span>
        </div>
        <div className="mine-carts" role="group" aria-label="Mine carts">
          {Array.from({ length: MINE_PICK_CARTS }, (_, c) => {
            const it = assigned[c];
            return (
              <button
                key={c}
                type="button"
                className={`mine-cart-btn${it ? ` open ${it.kind}` : ""}${reduced ? " still" : ""}`}
                disabled={!!it || done}
                onClick={() => reveal(c)}
                aria-label={it ? (it.kind === "prize" ? `Cart ${c + 1}: ${it.x} times bet` : `Cart ${c + 1}: collect`) : `Cart ${c + 1}, pick`}
              >
                <span className="mine-cart-art" aria-hidden><MineCart /></span>
                <span className="mine-cart-val">{it ? (it.kind === "prize" ? `${it.x}×` : "COLLECT") : "?"}</span>
              </button>
            );
          })}
        </div>
        {done ? (
          <button type="button" className="btn primary" onClick={onDone}>Collect {money(pick.totalWinCents)}</button>
        ) : (
          <button type="button" className="btn" onClick={revealAll}>Reveal the rest for me</button>
        )}
        <p className="mine-honest">
          How it works: the server drew the order of results when the bonus triggered and has already paid it.
          Whichever cart you tap shows the next result in that order, so no cart is a better or worse pick.
        </p>
      </div>
    </div>
  );
}

export default function MinePage() {
  const { user, setUser } = useUser();
  const credit = useFeatureCredit(setUser);
  // Research #5 slice 2: the server keeps the settled feature spin and how far it has been watched.
  const [resume, setResume] = useState<{ spin: Spin; progress: MineProgress } | null>(null);
  const [pickStart, setPickStart] = useState<number[]>([]);
  const saveQ = useRef<{ busy: boolean; next: { spinId: string; progress: MineProgress } | null }>({ busy: false, next: null });
  const saveProgress = useCallback((progress: MineProgress) => {
    const s = spinRef.current;
    if (!s || !(s.pick || s.freeSpins)) return;
    const q = saveQ.current;
    q.next = { spinId: s.id, progress };
    if (q.busy) return;
    const pump = async () => {
      q.busy = true;
      while (q.next) {
        const item = q.next; q.next = null;
        await api("/api/games/mine", { method: "POST", body: JSON.stringify({ action: "progress", ...item }) }).catch(() => { /* a missed save only means resuming a little earlier */ });
      }
      q.busy = false;
    };
    void pump();
  }, []);
  const [spin, setSpin] = useState<Spin | null>(null);
  const [grid, setGrid] = useState<MineSymbol[][] | null>(null);
  const [coin, setCoin] = useState(25);
  const [err, setErr] = useState<string | null>(null);
  useClearErrOnBalance(setErr);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const setPh = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  const [trigger, setTrigger] = useState<"fs" | "pick" | null>(null);
  const triggerRef = useRef<"fs" | "pick">("fs");
  const [fsIdx, setFsIdx] = useState(-1);
  const fsIdxRef = useRef(-1);
  const [fsWon, setFsWon] = useState(0);
  const [fsShown, setFsShown] = useState(false);
  const [retrig, setRetrig] = useState<number>(0);
  const [story, setStory] = useState(false);
  const [paid, setPaid] = useState(0);
  const { recap, add: addRecap } = useSpinRecap();
  const [lastCoin, rememberCoin] = useLastBet("mine");
  const [feelLive, setFeelLive] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [maxArmed, setMaxArmed] = useState(false);
  const machineRef = useRef<MineMachineHandle>(null);
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

  const coinIn = coin * 9;
  const [settleTick, setSettleTick] = useState(0);
  const auto = useAutoSpin({
    settleTick,
    spinOnce: () => void go(),
    balanceCents: useCallback(() => balRef.current, []),
    costCents: coinIn,
    jackpot: useCallback(() => !!(spinRef.current?.freeSpins || spinRef.current?.pick), []),
  });

  const fsSpin: FreeSpin | null = spin?.freeSpins && fsIdx >= 0 ? spin.freeSpins.spins[fsIdx] ?? null : null;
  const inFs = phase === "fs" || (phase === "summary" && !!spin?.freeSpins);

  const winLines = useMemo(() => {
    if (spinning) return [];
    if (phase === "fs" && fsSpin && fsShown) return fsSpin.lineWins.map((w) => w.line);
    if (phase === "idle" || phase === "trigger" || phase === "pick") return (spin?.lineWins ?? []).map((w) => w.line);
    return [];
  }, [spin, spinning, phase, fsSpin, fsShown]);

  const winShows = useMemo(() => {
    if (spinning) return [];
    if (phase === "fs" && fsSpin && fsShown) return freeSpinShows(fsSpin.grid, fsSpin.lineWins, MINE_PAYLINES, "DYNAMITE", "DYNAMITE scatter", fsSpin.winCents, MINE_FS_MULT);
    if (phase === "idle" && spin) return [...lineShows(spin.lineWins, MINE_PAYLINES), ...scatterShow(spin.grid, "DYNAMITE", spin.scatterWinCents, "DYNAMITE scatter")];
    return [];
  }, [spin, spinning, phase, fsSpin, fsShown]);

  const winCells = useMemo(() => {
    if (spinning) return [];
    if (phase === "fs" && fsSpin && fsShown) return cellsFor(fsSpin.grid, fsSpin.lineWins, fsSpin.retrigger ? ["DYNAMITE"] : []);
    if (phase === "trigger") return cellsFor(spin?.grid ?? null, [], trigger === "fs" ? ["DYNAMITE"] : ["CART"]);
    if (phase === "idle" && spin) return cellsFor(spin.grid, spin.lineWins, spin.scatters >= 3 ? ["DYNAMITE"] : []);
    return [];
  }, [spin, spinning, phase, fsSpin, fsShown, trigger]);

  const playNextFree = useCallback((idx: number) => {
    const s = spinRef.current;
    if (!s?.freeSpins) return;
    if (idx >= s.freeSpins.spins.length) { setPh("summary"); saveProgress({ phase: "summary", step: 0 }); return; }
    fsIdxRef.current = idx;
    setFsIdx(idx);
    if (idx % FS_SAVE_EVERY === 0) saveProgress({ phase: "fs", step: idx });
    setFsShown(false);
    setRetrig(0);
    setGrid(null);
    setSpinning(true);
    playSpin();
    later(() => setGrid(s.freeSpins!.spins[idx]!.grid), 180);
  }, [saveProgress]);

  // S5: the trigger shows a player-paced intro card; nothing starts until Start.
  const startFeature = useCallback((kind: "fs" | "pick") => {
    triggerRef.current = kind;
    setTrigger(kind);
    setPh("trigger");
    playFeature();
  }, []);

  const beginFeature = useCallback(() => {
    if (phaseRef.current !== "trigger") return;
    const kind = triggerRef.current;
    setTrigger(null);
    if (kind === "pick") { setPickStart([]); setPh("pick"); saveProgress({ phase: "pick", step: 0, picked: [] }); }
    else { setPh("fs"); setFsWon(0); playNextFree(0); }
  }, [playNextFree, saveProgress]);

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
    if (s?.pick || s?.freeSpins) {
      if (auto.running) auto.cancel();
      startFeature(s.pick ? "pick" : "fs");
      return;
    }
    setPaid((v) => v + (s?.winCents ?? 0));
    if (s) addRecap(s.betCents, s.winCents ?? 0);
    setPh("idle");
    setSettleTick((n) => n + 1);
  }, [playNextFree, startFeature, auto, addRecap]);

  function skipFree() {
    const s = spinRef.current;
    if (!s?.freeSpins) return;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setSpinning(false);
    setFsWon(s.freeSpins.totalWinCents);
    setPh("summary");
    saveProgress({ phase: "summary", step: 0 });
  }

  function finishFeature() {
    credit.release();
    const done = spinRef.current;
    if (done) void api("/api/games/mine", { method: "POST", body: JSON.stringify({ action: "collect", spinId: done.id }) }).catch(() => { /* next spin closes it anyway */ });
    setPaid((v) => v + (spinRef.current?.winCents ?? 0));
    if (spinRef.current) addRecap(spinRef.current.betCents, spinRef.current.winCents ?? 0, true);
    setPh("idle");
    setFsIdx(-1);
    fsIdxRef.current = -1;
    if (spinRef.current) setGrid(spinRef.current.grid);
    setSettleTick((n) => n + 1);
  }

  // Research #5 slice 2: a refresh mid-feature picks the round up where it was (server-saved place).
  const resumeChecked = useRef(false);
  useEffect(() => {
    if (!user || resumeChecked.current) return;
    resumeChecked.current = true;
    api("/api/games/mine?resume=1", { cache: "no-store" }).then((d) => {
      const f = d.feature as { spin: Spin; progress: MineProgress } | null;
      if (!f?.spin || !(f.spin.pick || f.spin.freeSpins) || phaseRef.current !== "idle" || spinRef.current) return;
      setSpin(f.spin);
      spinRef.current = f.spin;
      setCoin(f.spin.coinCents);
      setGrid(f.spin.grid);
      credit.accept(d.user, f.spin);
      const p = f.progress;
      if (p.phase === "intro") { startFeature(f.spin.pick ? "pick" : "fs"); return; }
      if (p.phase === "fsIntro") { startFeature("fs"); return; }
      if (p.phase === "summary") { setPh("summary"); return; }
      setResume({ spin: f.spin, progress: p });
      setPh("resume");
    }).catch(() => { /* nothing saved, or offline: the cabinet just starts fresh */ });
  }, [user, credit, startFeature]);

  function continueResume() {
    const r = resume;
    const s = spinRef.current;
    setResume(null);
    if (!r || !s) { setPh("idle"); return; }
    if (r.progress.phase === "pick" && s.pick) { setPickStart(minePickedCarts(r.progress)); setPh("pick"); return; }
    if (r.progress.phase === "fs" && s.freeSpins) { setPh("fs"); setFsWon(wonBefore(s.freeSpins, r.progress.step)); playNextFree(r.progress.step); return; }
    setPh("summary");
  }

  function afterPick() {
    const s = spinRef.current;
    if (s?.freeSpins) { startFeature("fs"); saveProgress({ phase: "fsIntro", step: 0 }); }
    else { setPh("summary"); saveProgress({ phase: "summary", step: 0 }); }
  }

  async function go(coinOverride?: number) {
    if (busy || spinning || phaseRef.current !== "idle") return;
    const c = coinOverride ?? coin;
    if (balRef.current < c * 9) {
      setErr(`This spin costs ${money(c * 9)} (coin × 9). Add sandbox chips in the Cage.`);
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
      const d = await api("/api/games/mine", { method: "POST", body: JSON.stringify({ coinCents: c, idempotencyKey: crypto.randomUUID() }) });
      rememberCoin(c);
      setSpin(d.spin);
      spinRef.current = d.spin;
      setGrid(d.spin.grid);
      credit.accept(d.user, d.spin);
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
    const best = maxBetCoin(balRef.current, 9, SLOT_COIN_MIN, SLOT_COIN_MAX);
    if (best === null) { setMaxArmed(false); setErr(maxBetRefusal(money(balRef.current), money(SLOT_COIN_MIN * 9))); return; }
    if (!maxArmed) { setMaxArmed(true); return; }
    setCoin(best);
    setMaxArmed(false);
    setErr(null);
  }

  const pays = (Object.keys(MINE_PAYTABLE) as (keyof typeof MINE_PAYTABLE)[]).slice(0, 4).map((k) => {
    const a = MINE_SYM_ART[k];
    return { key: k, label: a.label, tone: a.tone, Svg: a.Svg, pay5: MINE_PAYTABLE[k][2] };
  });

  const showResult = phase === "idle" && !!spin && !spinning;
  const deckWin = phase === "fs" ? fsWon : phase === "summary" || (showResult && (spin?.freeSpins || spin?.pick)) ? spin?.winCents ?? 0 : showResult ? spin?.baseWinCents ?? 0 : 0;
  const fsTotal = spin?.freeSpins ? spin.freeSpins.spins.length : 0;

  // Backlog #6: one shared honest celebration (plate + glow) from the server's settled result.
  const cele = celebrationFor({ betCents: coinIn, winCents: spin?.winCents, settled: showResult && !!spin, feature: !!(spin?.freeSpins || spin?.pick), reduced, feelOn: feelLive });
  return (
    <Shell>
      {(u) => {
        balRef.current = u.balanceCents;
        return (
          <div className="slot-page mine-page">
            <div className="slot-page-hero">
              <p className="lede">Story video slot · free spins · pick bonus</p>
              <h1>Canary Creek Mine</h1>
              <p className="muted">9 lines · 5 reels · <button type="button" className="linkish mine-story-link" onClick={() => setStory(true)}>Clem&apos;s story</button></p>
              <MathStrip game="mine" variant="hero" />
              <p className="math-strip math-strip-hero mine-feature-line">{MINE_FEATURE_LINE}</p>
            </div>
            <FirstVisitTip game="mine" />

            <div className="slot-stage-wrap mine-stage">
              {inFs && (
                <div className="mine-fs-bar" role="status" aria-live="polite">
                  <span className="mine-fs-k">FREE SPINS ×2</span>
                  <span>Spin <b>{Math.max(1, fsIdx + 1)}</b> of <b>{fsSpin?.awardedTotal ?? fsTotal}</b></span>
                  <span>Won <b>{money(fsWon)}</b></span>
                  {phase === "fs" && <button type="button" className="btn mine-skip" onClick={skipFree}>Skip to total</button>}
                </div>
              )}
              <MineMachine
                ref={machineRef}
              peekGame="mine"
              peekBet={{ coinCents: coin }}
                grid={grid}
                spinning={spinning}
                winCells={winCells}
                winShows={winShows}
                onSpinComplete={onSpinComplete}
                glow={cele.glow}
                glowLive={cele.live}
                celebration={cele}
                turbo={turboOn || phase === "fs"}
                winLines={winLines}
                trigger={reduced ? null : trigger}
                freeMode={phase === "fs"}
                topper={<CabinetTopper title="Canary Creek Mine" kicker="Free spins · Mine Cart · 9 lines" infoGame="mine" info={<>3+ dynamite = free spins · carts on reels 1, 3 &amp; 5 = Mine Cart pick · Coin {money(coin)} × 9 lines</>} />}
                belly={<CabinetBelly pays={pays} note={<>5 of a kind × coin · 3+ dynamite pay 2× / 10× / 50× bet · RTP 95.42% incl. features</>} />}
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
                    recap={recap}
                    maxLabel="Max bet"
                    auto={auto}
                    note="Sandbox / test chips · no cash value · 21+"
                  />
                }
                lever={<CabinetLever onPull={() => void go()} disabled={busy || spinning || auto.running || phase !== "idle"} reduced={reduced} />}
              />
              {phase === "fs" && retrig > 0 && (
                <div className="mine-trigger mine-trigger-fs still" role="status"><div className="mine-trigger-card"><span className="mine-trigger-k">Retrigger</span><span className="mine-trigger-h">+{retrig} FREE SPINS</span></div></div>
              )}
            </div>

            {phase === "pick" && spin?.pick && <PickBoard key={spin.id} pick={spin.pick} betCents={spin.betCents} reduced={reduced} initialOpened={pickStart} onOpen={(opened) => saveProgress({ phase: "pick", step: opened.length, picked: opened })} onDone={afterPick} />}

            {phase === "resume" && resume && (
              <BonusIntroCard
                theme="mine-bookend"
                testId="bonus-resume"
                wonLabel="Picking up at:"
                note={RESUME_NOTE}
                intro={{
                  kicker: "Welcome back · your place was saved",
                  title: resume.progress.phase === "pick" ? "Mine Cart Pick" : "Free Spins",
                  won: mineResumeWhere(resume.spin, resume.progress),
                  rule: `Your ${money(resume.spin.betCents)} spin's feature plays on from here, exactly as drawn; Collect at the end shows the win on your Balance.`,
                  start: "Resume",
                }}
                onStart={continueResume}
              />
            )}

            {phase === "trigger" && trigger && spin && (
              <BonusIntroCard
                theme="mine-bookend"
                intro={bonusIntro("mine", trigger === "fs" ? { kind: "fs", spins: spin.freeSpins?.initial ?? 0, scatters: spin.scatters } : { kind: "pick" }, spin.betCents)}
                onStart={beginFeature}
              />
            )}

            {phase === "summary" && spin && <BonusSummaryCard theme="mine-bookend" summary={mineSummary(spin, MINE_FS_CAP)} onCollect={finishFeature} />}

            {showResult && spin && !spin.freeSpins && !spin.pick && spin.winCents > coinIn && (
              <OutcomeBanner win title="YOU WIN" amountCents={spin.winCents} stakeCents={coinIn} subtitle={`${money(spin.winCents)} back on a ${money(coinIn)} bet · net +${money(spin.winCents - coinIn)}`} />
            )}
            {showResult && spin && !spin.freeSpins && !spin.pick && spin.winCents > 0 && spin.winCents <= coinIn && (
              <OutcomeBanner push title={spin.winCents === coinIn ? "BET BACK" : "PART BACK"} amountCents={spin.winCents} stakeCents={coinIn} subtitle={spin.winCents === coinIn ? `${money(spin.winCents)} back · net $0.00` : `${money(spin.winCents)} back on a ${money(coinIn)} bet · net −${money(coinIn - spin.winCents)}`} />
            )}
            {showResult && spin && !spin.freeSpins && !spin.pick && spin.winCents === 0 && <OutcomeBanner quiet title="NO LINE" subtitle="You lose this spin." />}
            {showResult && spin && (spin.freeSpins || spin.pick) && (
              <OutcomeBanner win={spin.winCents > coinIn} push={spin.winCents <= coinIn} title={spin.winCents > coinIn ? "FEATURE WIN" : "FEATURE PAID"} amountCents={spin.winCents} stakeCents={coinIn} subtitle={`${money(spin.winCents)} back on a ${money(coinIn)} bet, features included · net ${spin.winCents === coinIn ? "$0.00" : spin.winCents > coinIn ? `+${money(spin.winCents - coinIn)}` : `−${money(coinIn - spin.winCents)}`}`} />
            )}

            <div className="panel mine-info" id="paytable" style={{ marginTop: 20 }}>
              <h3>Paytable (per line, × coin)</h3>
              <table className="paytable">
                <thead><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr></thead>
                <tbody>
                  {(Object.keys(MINE_PAYTABLE) as (keyof typeof MINE_PAYTABLE)[]).map((k) => {
                    const a = MINE_SYM_ART[k]; const I = a.Svg; const v = MINE_PAYTABLE[k];
                    return <tr key={k}><td className="pt-sym"><span className={`pt-art tone-${a.tone}`} aria-hidden><I /></span><span>{a.label}</span></td><td>{v[0]}</td><td>{v[1]}</td><td>{v[2]}</td></tr>;
                  })}
                </tbody>
              </table>
              <h4>Features</h4>
              <ul className="mine-rules">
                <li><b>Wild</b> (Clem&apos;s lamp hat) lands on reels 2–4 and stands in for every pay symbol, not dynamite or carts.</li>
                <li><b>Dynamite</b> pays anywhere: 3 / 4 / 5 pay {MINE_SCATTER_PAY[3]}× / {MINE_SCATTER_PAY[4]}× / {MINE_SCATTER_PAY[5]}× the total bet and award {MINE_FS_AWARD[3]} / {MINE_FS_AWARD[4]} / {MINE_FS_AWARD[5]} free spins.</li>
                <li><b>Free spins</b> use the same reels and bet; every free-spin win is doubled. 3+ dynamite during free spins add the same awards again, up to {MINE_FS_CAP} free spins per feature. Carts do nothing during free spins.</li>
                <li><b>Mine Cart pick</b>: a cart on reels 1, 3 and 5 (any row). 12 carts hold {MINE_PICK_PRIZES.join(", ")}× bet and 3 COLLECT lamps. The first cart always holds ore; you keep picking until a COLLECT. Average {MINE_MATH.pickExpectedX}× bet.</li>
                <li><b>Honest picks</b>: the server draws the reveal order at trigger time and pays it at once. The cart you tap shows the next result in that order, so there is no better or worse cart.</li>
              </ul>
              <MathStrip game="mine" variant="panel" />
              <p className="muted">
                Exact theoretical RTP {(MINE_MATH.rtp * 100).toFixed(2)}%: base game {(MINE_MATH.baseRtp * 100).toFixed(2)}% (lines {(MINE_MATH.lineRtp * 100).toFixed(2)}% + dynamite {(MINE_MATH.scatterRtp * 100).toFixed(2)}%),
                free spins {(MINE_MATH.freeSpinsRtp * 100).toFixed(2)}%, Mine Cart {(MINE_MATH.pickRtp * 100).toFixed(2)}%. Hit rate {(MINE_MATH.hitRate * 100).toFixed(1)}% (any return or feature).
                {" "}{MINE_FEATURE_LINE}. A free-spins feature averages {MINE_MATH.freeSpinsPerFeature.toFixed(2)} spins and {MINE_MATH.freeSpinFeatureX.toFixed(1)}× bet.
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

            <ActionDock hint={phase === "fs" ? "Free spins playing · Skip to total any time" : spinning ? "Stop · or tap a reel · reels in motion…" : "Pick a coin size, then Spin."} busy={busy || spinning || phase !== "idle"}>
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
