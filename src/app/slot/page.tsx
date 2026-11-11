"use client";
import { SYM_ART } from "@/components/SlotMachine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Shell from "@/components/Shell";
import SlotMachine, { type SlotMachineHandle, type WinCell } from "@/components/SlotMachine";
import { ActionDock, OutcomeBanner, FirstVisitTip, useClearErrOnBalance } from "@/components/TableUX";
import { api, money, useUser } from "@/components/useUser";
import { PAYLINES, type Symbol } from "@/lib/games/slot";
import { slotGlowTier, soundOn, reducedMotion, playSpin } from "@/lib/feel";
import { SLOT_TURBO_KEY, slotTurboEffective } from "@/lib/slotFeel";
import QuickBetRow, { useLastBet } from "@/components/QuickBet";
import { SLOT_COIN_CHIPS, SLOT_COIN_MAX, SLOT_COIN_MIN } from "@/lib/quickBet";
import { CabinetBelly, CabinetDeck, CabinetLever, CabinetTopper, useAutoSpin } from "@/components/SlotCabinet";
import { bellyPays, ledText, stepCoin } from "@/lib/cabinet";

type LineWin = { line: number; symbol: Symbol | null; count: number; pay: number; winCents: number };

function cellsFromLineWins(lineWins: LineWin[] | undefined): WinCell[] {
  if (!lineWins?.length) return [];
  const out: WinCell[] = [];
  const seen = new Set<string>();
  for (const w of lineWins) {
    const pattern = PAYLINES[w.line];
    if (!pattern) continue;
    const n = Math.max(0, w.count || 0);
    for (let reel = 0; reel < n && reel < pattern.length; reel++) {
      const row = pattern[reel]!;
      const key = `${reel}-${row}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ reel, row });
    }
  }
  return out;
}

export default function SlotPage() {
  const { setUser } = useUser();
  const [info, setInfo] = useState<any>(null);
  const [spin, setSpin] = useState<any>(null);
  const [grid, setGrid] = useState<Symbol[][] | null>(null);
  const [coin, setCoin] = useState(100);
  const [err, setErr] = useState<string | null>(null);
  useClearErrOnBalance(setErr);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [showOutcome, setShowOutcome] = useState(false);
  const machineRef = useRef<SlotMachineHandle>(null);
  const [lastCoin, rememberCoin] = useLastBet("slot");
  const [feelLive, setFeelLive] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
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

  useEffect(() => {
    api("/api/games/slot").then(setInfo).catch((e) => setErr(e.message));
  }, []);

  const [maxArmed, setMaxArmed] = useState(false);
  const [settleTick, setSettleTick] = useState(0);
  const balRef = useRef(0);
  const coinIn = coin * 9;
  const auto = useAutoSpin({
    settleTick,
    spinOnce: () => void go(),
    balanceCents: useCallback(() => balRef.current, []),
    costCents: coinIn,
    jackpot: useCallback(() => false, []),
  });
  const winLines = useMemo(
    () => (showOutcome ? ((spin?.lineWins as LineWin[] | undefined) ?? []).filter((w) => w.winCents > 0).map((w) => w.line) : []),
    [spin, showOutcome],
  );

  const winCells = useMemo(
    () => (showOutcome ? cellsFromLineWins(spin?.lineWins as LineWin[] | undefined) : []),
    [spin, showOutcome],
  );

  const winRef = useRef(0);
  const [paid, setPaid] = useState(0);
  const onSpinComplete = useCallback(() => {
    setPaid((p) => p + winRef.current);
    winRef.current = 0;
    setSpinning(false);
    setBusy(false);
    setShowOutcome(true);
    setSettleTick((n) => n + 1);
  }, []);

  async function go(coinOverride?: number) {
    if (busy || spinning) return;
    const c = coinOverride ?? coin;
    setErr(null);
    setMaxArmed(false);
    setBusy(true);
    setShowOutcome(false);
    setGrid(null); // force filler until server result arrives
    setSpinning(true);
    playSpin();
    try {
      const d = await api("/api/games/slot", {
        method: "POST",
        body: JSON.stringify({ coinCents: c, idempotencyKey: crypto.randomUUID() }),
      });
      rememberCoin(c); // only after the server accepted the bet
      winRef.current = d.spin.winCents || 0;
      setSpin(d.spin);
      setGrid(d.spin.grid as Symbol[][]);
      if (d.user) setUser(d.user);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
      auto.fail();
      setSpinning(false);
      setBusy(false);
    }
  }

  function onPrimary() {
    if (spinning) {
      machineRef.current?.stopAll();
      if (auto.running) auto.cancel();
      return;
    }
    if (auto.running) { auto.cancel(); return; }
    void go();
  }

  function onMaxBet() {
    if (!maxArmed) { setMaxArmed(true); return; }
    setCoin(SLOT_COIN_MAX);
    setMaxArmed(false);
  }

  const pays = bellyPays(info?.paytable).flatMap((p) => {
    const a = (SYM_ART as any)[p.sym];
    return a ? [{ key: p.sym, label: a.label, tone: a.tone, Svg: a.Svg, pay5: p.pay5 }] : [];
  });

  return (
    <Shell>
      {(u) => { balRef.current = u.balanceCents; return (
        <div className="slot-page">
          <div className="slot-page-hero">
            <p className="lede">Western video slot</p>
            <h1>Sundown Trail</h1>
            <p className="muted">9 lines · 5 reels · published RTP 94–96%</p>
          </div>
          <FirstVisitTip game="slot" />
          {err && <p className="err">{err}</p>}

          <div className="slot-stage-wrap">
            <SlotMachine
              ref={machineRef}
              grid={grid}
              spinning={spinning}
              winCells={winCells}
              onSpinComplete={onSpinComplete}
              glow={showOutcome && spin ? slotGlowTier(coinIn, spin.winCents) : 0}
              glowLive={feelLive}
              turbo={turboOn}
              winLines={winLines}
              topper={<CabinetTopper title="Sundown Trail" kicker="9 lines · 5 reels" info={<>Lines played: 9 · Coin {money(coin)} · Spins pay left to right</>} />}
              belly={<CabinetBelly pays={pays} note={<>Pays left to right on 9 lines · × coin · {info?.rtpPublished ? "published RTP 94–96%" : "Sandbox"}</>} />}
              deck={
                <CabinetDeck
                  creditCents={u.balanceCents}
                  betCents={coinIn}
                  win={ledText(showOutcome && spin ? spin.winCents : 0)}
                  winLit={!!(showOutcome && spin && spin.winCents > 0)}
                  spinning={spinning}
                  busy={busy}
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
              lever={<CabinetLever onPull={() => void go()} disabled={busy || spinning || auto.running} reduced={reduced} />}
            />
          </div>

          {showOutcome && spin && spin.winCents > 0 && spin.winCents <= coinIn && (
            <OutcomeBanner
              push
              title={spin.winCents === coinIn ? "BET BACK" : "PART BACK"}
              amountCents={spin.winCents}
              stakeCents={coinIn}
              subtitle={spin.winCents === coinIn ? `${money(spin.winCents)} back on a ${money(coinIn)} bet · net $0.00` : `${money(spin.winCents)} back on a ${money(coinIn)} bet · net −${money(coinIn - spin.winCents)}`}
            />
          )}
          {showOutcome && spin && spin.winCents > coinIn && (
            <OutcomeBanner
              win
              title="YOU WIN"
              amountCents={spin.winCents}
              stakeCents={coinIn}
              subtitle={`${money(spin.winCents)} back on a ${money(coinIn)} bet · net +${money(spin.winCents - coinIn)}`}
            />
          )}
          {showOutcome && spin && spin.winCents === 0 && (
            <OutcomeBanner
              title="NO LINE"
              subtitle="You lose this spin."
            />
          )}

          {info && (
            <div className="panel" id="paytable" style={{ marginTop: 20 }}>
              <h3>Paytable (per line, × coin)</h3>
              <table className="paytable">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>3</th>
                    <th>4</th>
                    <th>5</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(info.paytable || {}).map(([k, v]: any) => (
                    <tr key={k}>
                      <td className="pt-sym">{(() => { const a = (SYM_ART as any)[k]; if (!a) return k; const I = a.Svg; return (<><span className={`pt-art tone-${a.tone}`} aria-hidden><I /></span><span>{a.label}</span></>); })()}</td>
                      <td>{v[0]}</td>
                      <td>{v[1]}</td>
                      <td>{v[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">{info.rtpPublished}</p>
            </div>
          )}

          <div className="rl-tools">
            <label className="rl-toggle">
              <input type="checkbox" checked={turboOn} onChange={(e) => setTurbo(e.target.checked)} disabled={reduced} />
              {" "}Turbo spin
            </label>
            {reduced && <span className="muted">Reduced motion: faster reel settles</span>}
          </div>

          <ActionDock hint={spinning ? "Stop · or tap a reel · reels in motion…" : "Pick a coin size, then Spin."} busy={busy || spinning}>
            <QuickBetRow
              amounts={SLOT_COIN_CHIPS}
              selected={coin}
              onSelect={setCoin}
              lastCoinCents={lastCoin}
              balanceCents={u.balanceCents}
              busy={busy || spinning || auto.running}
              onRepeat={(c) => { setCoin(c); void go(c); }}
              minCents={SLOT_COIN_MIN}
              maxCents={SLOT_COIN_MAX}
            />
            <button
              type="button"
              className="btn primary hero-act"
              disabled={busy && !spinning}
              onClick={onPrimary}
              aria-label={spinning ? "Stop reels" : `Spin for ${money(coinIn)}`}
            >
              {spinning ? "Stop" : `Spin · ${money(coinIn)}`}
            </button>
          </ActionDock>
        </div>
      ); }}
    </Shell>
  );
}
