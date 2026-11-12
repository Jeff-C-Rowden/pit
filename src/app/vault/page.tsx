"use client";

import { SandboxChip } from "@/components/SandboxChip";
import { VS_SYM_ART } from "@/components/VaultSpireMachine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Shell from "@/components/Shell";
import VaultSpireMachine, { type VaultSpireMachineHandle, type WinCell } from "@/components/VaultSpireMachine";
import HitHistoryStrip from "@/components/HitHistory";
import PotSheet from "@/components/PotSheet";
import ProgressiveMeterStrip, { type MeterPublic, useReseedMoments } from "@/components/ProgressiveMeter";
import { momentsFromNewHits, momentsFromSpinHits } from "@/lib/reseedMoment";
import { ActionDock, OutcomeBanner, FirstVisitTip, useClearErrOnBalance } from "@/components/TableUX";
import { MathStrip } from "@/components/VolatilityMeter";
import { api, money, useUser } from "@/components/useUser";
import { VS_MAX_COIN_CENTS, VS_MIN_COIN_CENTS, VS_PAYLINES, VS_TOTAL_CONTRIBUTION_BPS, type VsSymbol } from "@/lib/games/slotProgressive";
import { lineShows } from "@/lib/winShow";
import { slotGlowTier, soundOn, reducedMotion, playSpin } from "@/lib/feel";
import { SLOT_TURBO_KEY, slotTurboEffective } from "@/lib/slotFeel";
import QuickBetRow, { useLastBet } from "@/components/QuickBet";
import { SLOT_COIN_CHIPS, SLOT_COIN_MAX, SLOT_COIN_MIN } from "@/lib/quickBet";
import { CabinetBelly, CabinetDeck, CabinetLever, CabinetTopper, useAutoSpin } from "@/components/SlotCabinet";
import { bellyPays, ledText, stepCoin, maxBetCoin, maxBetRefusal } from "@/lib/cabinet";

type LineWin = { line: number; symbol: VsSymbol | null; count: number; pay: number; winCents: number };
type ProgHit = { tierId: string; name: string; awardCents: number; reseedsTo?: number };

function cellsFromLineWins(lineWins: LineWin[] | undefined): WinCell[] {
  if (!lineWins?.length) return [];
  const out: WinCell[] = [];
  const seen = new Set<string>();
  for (const w of lineWins) {
    const pattern = VS_PAYLINES[w.line];
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

function CountUp({ cents, active }: { cents: number; active: boolean }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!active) {
      setDisplay(0);
      return;
    }
    const t0 = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      setDisplay(Math.round(cents * (1 - (1 - p) * (1 - p))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cents, active]);
  return <>{ledText(display)}</>;
}

export default function VaultPage() {
  const { setUser } = useUser();
  const [info, setInfo] = useState<any>(null);
  const [meters, setMeters] = useState<MeterPublic[]>([]);
  const [spin, setSpin] = useState<any>(null);
  const [grid, setGrid] = useState<VsSymbol[][] | null>(null);
  const [coin, setCoin] = useState(100);
  const [err, setErr] = useState<string | null>(null);
  useClearErrOnBalance(setErr);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [showOutcome, setShowOutcome] = useState(false);
  const [lastWinCents, setLastWinCents] = useState(0);
  const [hitTierIds, setHitTierIds] = useState<string[]>([]);
  const [jackpotModal, setJackpotModal] = useState<ProgHit[] | null>(null);
  const [reseedBeat, setReseedBeat] = useState(false);
  const [reseed, addReseed] = useReseedMoments();
  const seenHitsRef = useRef<Set<string> | null>(null);
  const metersRef = useRef<MeterPublic[]>([]);
  metersRef.current = meters;
  const pendingMetersRef = useRef<MeterPublic[] | null>(null);
  const [infoSheet, setInfoSheet] = useState<MeterPublic | "game" | null>(null);
  const [maxArmed, setMaxArmed] = useState(false);
  const [lastCoin, rememberCoin] = useLastBet("vault");
  const [feelLive, setFeelLive] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const f = () => setFeelLive(soundOn() && !reducedMotion());
    f();
    window.addEventListener("pit-sound", f);
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

  const spinRef = useRef<any>(null);
  spinRef.current = spin;
  const balRef = useRef(0);
  const machineRef = useRef<VaultSpireMachineHandle>(null);

  const coinIn = coin * 9;
  const [settleTick, setSettleTick] = useState(0);
  const auto = useAutoSpin({
    settleTick,
    spinOnce: () => void go(),
    balanceCents: useCallback(() => balRef.current, []),
    costCents: coinIn,
    jackpot: useCallback(() => ((spinRef.current?.progressiveHits as ProgHit[] | undefined)?.length ?? 0) > 0, []),
  });
  const winLines = useMemo(
    () => (showOutcome ? ((spin?.lineWins as LineWin[] | undefined) ?? []).filter((w) => w.winCents > 0).map((w) => w.line) : []),
    [spin, showOutcome],
  );
  const contribPreview = Math.floor((coinIn * VS_TOTAL_CONTRIBUTION_BPS) / 10_000);

  // J4: a real hit by anyone that lands while we watch shows a reseed moment.
  // First load only records existing hits (history is not replayed as live).
  const takeHits = useCallback((d: any) => {
    const ms = (d?.meters as MeterPublic[] | undefined) ?? metersRef.current;
    const r = momentsFromNewHits(seenHitsRef.current, d?.recentHits, ms, Date.now());
    seenHitsRef.current = r.seen;
    addReseed(r.moments);
  }, [addReseed]);

  const refreshMeters = useCallback(() => {
    api("/api/games/slot-progressive")
      .then((d) => {
        setInfo(d);
        if (d.meters) setMeters(d.meters);
        takeHits(d);
      })
      .catch(() => {});
  }, [takeHits]);

  useEffect(() => {
    api("/api/games/slot-progressive")
      .then((d) => {
        setInfo(d);
        if (d.meters) setMeters(d.meters);
        takeHits(d);
      })
      .catch((e) => setErr(e.message));
  }, [takeHits]);

  // Meter poll — calm 2.5s ticks while idle (meters move only on real spins)
  useEffect(() => {
    if (spinning || busy || jackpotModal) return;
    const t = window.setInterval(refreshMeters, 2500);
    return () => window.clearInterval(t);
  }, [spinning, busy, jackpotModal, refreshMeters]);

  const winShows = useMemo(() => (showOutcome ? lineShows(spin?.lineWins as LineWin[] | undefined, VS_PAYLINES) : []), [spin, showOutcome]);

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
    const hits = (spinRef.current?.progressiveHits as ProgHit[] | undefined) ?? [];
    if (pendingMetersRef.current) {
      // Reseeded meters were held back so the reels, not the meter, reveal the hit.
      setMeters(pendingMetersRef.current);
      pendingMetersRef.current = null;
    }
    if (hits.length) {
      setHitTierIds(hits.map((h) => h.tierId));
      setJackpotModal(hits);
      setReseedBeat(false);
      window.setTimeout(() => setReseedBeat(true), 900);
    }
  }, []);

  // Failsafe: if reels never call onSpinComplete, unstick the dock
  useEffect(() => {
    if (!spinning) return;
    const t = window.setTimeout(() => {
      setSpinning(false);
      setBusy(false);
      setErr("Spin timed out — try again");
    }, 14000);
    return () => window.clearTimeout(t);
  }, [spinning]);

  async function go(coinOverride?: number) {
    if (busy || spinning) return;
    const c = coinOverride ?? coin;
    const cost = c * 9;
    const bal = balRef.current;
    if (bal < cost) {
      setErr(
        `This spin costs ${money(cost)} (coin × 9). Add sandbox chips above.`,
      );
      auto.fail();
      return;
    }
    setErr(null);
    setBusy(true);
    setShowOutcome(false);
    setLastWinCents(0);
    setHitTierIds([]);
    setJackpotModal(null);
    setReseedBeat(false);
    setGrid(null);
    setSpinning(true);
    playSpin();
    setMaxArmed(false);
    try {
      const d = await api("/api/games/slot-progressive", {
        method: "POST",
        body: JSON.stringify({ coinCents: c, idempotencyKey: crypto.randomUUID() }),
      });
      rememberCoin(c); // only after the server accepted the bet
      // Own hits get their moment from the spin result after the modal; mark
      // them seen so the poll doesn't replay them.
      seenHitsRef.current = momentsFromNewHits(seenHitsRef.current ?? new Set(), d.recentHits, [], Date.now()).seen;
      setSpin(d.spin);
      setGrid(d.spin.grid as VsSymbol[][]);
      setLastWinCents(d.spin.winCents || 0);
      winRef.current = d.spin.winCents || 0;
      if (d.meters) {
        if ((d.spin.progressiveHits as ProgHit[] | undefined)?.length) pendingMetersRef.current = d.meters;
        else setMeters(d.meters);
      }
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

  function setCoinAndClear(n: number) {
    setCoin(n);
    setMaxArmed(false);
  }

  function onMaxBet() {
    const best = maxBetCoin(balRef.current, 9, VS_MIN_COIN_CENTS, VS_MAX_COIN_CENTS);
    if (best === null) { setMaxArmed(false); setErr(maxBetRefusal(money(balRef.current), money(VS_MIN_COIN_CENTS * 9))); return; }
    if (!maxArmed) { setMaxArmed(true); return; }
    setCoin(best);
    setMaxArmed(false);
    setErr(null);
  }

  const pays = bellyPays(info?.paytable).flatMap((p) => {
    const a = (VS_SYM_ART as any)[p.sym];
    return a ? [{ key: p.sym, label: a.label, tone: a.tone, Svg: a.Svg, pay5: p.pay5 }] : [];
  });

  const hits = (spin?.progressiveHits as ProgHit[] | undefined) ?? [];
  const hasJackpot = showOutcome && hits.length > 0;
  const lineOnlyWin = showOutcome && !hasJackpot && lastWinCents > 0;

  return (
    <Shell>
      {(u) => {
        balRef.current = u.balanceCents;
        return (
        <div className="vault-page">
          <div className="vault-topbar">
            <div className="vault-title-block">
              <p className="lede">Frontier progressive video slot</p>
              <h1>Antler Ridge</h1>
              <MathStrip game="vault" variant="hero" />
            </div>
            <div className="vault-badges">
              <SandboxChip />
              <span className="vault-qualify-badge" title="All sandbox bets feed the progressive">
                All bets qualify · {money(contribPreview)} to pots
              </span>
            </div>
          </div>

          <FirstVisitTip game="vault" />
          {err && <p className="err">{err}</p>}

          <div className="vault-hero">
            <div className="vault-stage-wrap">
              <VaultSpireMachine
                ref={machineRef}
                grid={grid}
                spinning={spinning}
                winCells={winCells}
                winShows={winShows}
                onSpinComplete={onSpinComplete}
                glow={showOutcome ? slotGlowTier(coinIn, lastWinCents) : 0}
                glowLive={feelLive}
                turbo={turboOn}
                winLines={winLines}
                topper={
                  <CabinetTopper title="Antler Ridge" kicker="Progressive · 9 lines" info={<>All bets qualify · Coin {money(coin)} × 9 lines · 3% of each bet feeds the pots</>}>
                    <ProgressiveMeterStrip
                      meters={meters}
                      quiet={spinning || busy}
                      hitTierIds={hitTierIds}
                      reseed={reseed}
                      onOpenInfo={(m) => setInfoSheet(m)}
                    />
                    <div className="prog-strip-sandbox"><SandboxChip /></div>
                  </CabinetTopper>
                }
                belly={<CabinetBelly pays={pays} note={<>Pays left to right on 9 lines · × coin · 3% of each bet feeds the pots</>} />}
                deck={
                  <CabinetDeck
                    creditCents={u.balanceCents}
                    betCents={coinIn}
                    win={showOutcome ? <CountUp cents={lastWinCents} active={showOutcome} /> : "0.00"}
                    winLit={showOutcome && lastWinCents > 0}
                    spinning={spinning}
                    busy={busy}
                    canBetDown={coin > SLOT_COIN_MIN}
                    canBetUp={coin < SLOT_COIN_MAX}
                    onBetDown={() => setCoinAndClear(stepCoin(coin, -1))}
                    onBetUp={() => setCoinAndClear(stepCoin(coin, 1))}
                    onBetOne={() => setCoinAndClear(coin >= SLOT_COIN_MAX ? SLOT_COIN_MIN : stepCoin(coin, 1))}
                    onMax={onMaxBet}
                    maxArmed={maxArmed}
                    onSpin={onPrimary}
                    onPayTable={() => setInfoSheet("game")}
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
          </div>

          {lineOnlyWin && (
            <OutcomeBanner
              win
              title="YOU WIN"
              amountCents={lastWinCents}
              stakeCents={coinIn}
              subtitle={`${money(lastWinCents)} added to your stack`}
            />
          )}
          {showOutcome && !hasJackpot && lastWinCents === 0 && (
            <OutcomeBanner quiet title="NO LINE" subtitle="You lose this spin." />
          )}

          {jackpotModal && (
            <div className="vault-jp-modal" role="dialog" aria-modal="true" aria-label="Jackpot">
              <div className="vault-jp-card">
                <SandboxChip className="vault-jp-sandbox" />
                <div className="vault-jp-headline">JACKPOT</div>
                {jackpotModal.map((h) => (
                  <div key={h.tierId} className="vault-jp-tier">
                    <span className="vault-jp-tier-name">{h.name}</span>
                    <span className="vault-jp-tier-amt">{money(h.awardCents)}</span>
                  </div>
                ))}
                <p className="vault-jp-sub">
                  {reseedBeat
                    ? "Meters reseeding to seed…"
                    : "Locking pot · paying via ledger"}
                </p>
                {reseedBeat && (
                  <div className="vault-jp-reseed" aria-hidden>
                    {jackpotModal.map((h) => (
                      <span key={h.tierId}>
                        {h.name} → {money(h.reseedsTo ?? 0)}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    addReseed(momentsFromSpinHits(jackpotModal, metersRef.current, Date.now()));
                    setJackpotModal(null);
                    refreshMeters();
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          <HitHistoryStrip tiers={meters} hits={info ? (Array.isArray(info.hitHistory) ? info.hitHistory : []) : null} />

          <div className="vault-info-blurb panel">
            <p>
              <strong>Sandbox progressive.</strong> Demo chips only — not a licensed casino jackpot.
              Each spin contributes 3% of coin-in across Mini / Minor / Major / Grand (same bet debit).
              Must-hit tiers use a hidden threshold between seed and ceiling; Grand is a rare mystery.
              Pots reseed after a hit. Tap any meter for details.
            </p>
            <button type="button" className="btn vault-info-btn" onClick={() => setInfoSheet("game")}>
              Game info
            </button>
          </div>

          {infoSheet && infoSheet !== "game" && <PotSheet meter={meters.find((m) => m.id === infoSheet.id) ?? infoSheet} onClose={() => setInfoSheet(null)} />}
          {infoSheet === "game" && (
            <div className="vault-sheet-backdrop" onClick={() => setInfoSheet(null)} role="presentation">
              <div className="vault-sheet panel" role="dialog" aria-modal="true" aria-label="Antler Ridge game info" onClick={(e) => e.stopPropagation()}>
                {infoSheet === "game" ? (
                  <>
                    <h3>Antler Ridge</h3>
                    <MathStrip game="vault" variant="panel" />
                    <p className="muted">{info?.rtpPublished || info?.info?.rtpNote}</p>
                    <h4>Paytable (× coin)</h4>
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
                        {Object.entries(info?.paytable || {}).map(([k, v]: any) => (
                          <tr key={k}>
                            <td className="pt-sym">{(() => { const a = (VS_SYM_ART as any)[k]; if (!a) return k; const I = a.Svg; return (<><span className={`pt-art tone-${a.tone}`} aria-hidden><I /></span><span>{a.label}</span></>); })()}</td>
                            <td>{v[0]}</td>
                            <td>{v[1]}</td>
                            <td>{v[2]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : null}
                <button type="button" className="btn" onClick={() => setInfoSheet(null)}>
                  Close
                </button>
              </div>
            </div>
          )}

          <div className="rl-tools">
            <label className="rl-toggle">
              <input type="checkbox" checked={turboOn} onChange={(e) => setTurbo(e.target.checked)} disabled={reduced} />
              {" "}Turbo spin
            </label>
            {reduced && <span className="muted">Reduced motion: faster reel settles</span>}
          </div>

          <ActionDock
            busy={busy || spinning}
            hint={
              spinning
                ? "Stop · or tap a reel · reels in motion…"
                : u.balanceCents < coinIn
                  ? `Cage needs funds — spin costs ${money(coinIn)} (coin × 9).`
                  : "All bets qualify. Pick a coin, then Spin."
            }
          >
            <div className="vault-dock">
              {(err || u.balanceCents < coinIn) && (
                <p className="err dock-err">
                  {err ||
                    `This spin costs ${money(coinIn)} (coin × 9). Add sandbox chips above.`}
                </p>
              )}
              <div className="vault-dock-bet">
                <div className="vault-bet-head">
                  <div className="vault-total-bet">
                    Total bet <strong>{money(coinIn)}</strong>
                    <span className="muted"> · coin {money(coin)} × 9 lines</span>
                  </div>
                  <button
                    type="button"
                    className={`btn vault-max${maxArmed ? " armed" : ""}`}
                    onClick={onMaxBet}
                    disabled={busy || spinning}
                  >
                    {maxArmed ? `Confirm Max ${money(maxBetCoin(balRef.current, 9, VS_MIN_COIN_CENTS, VS_MAX_COIN_CENTS) ?? VS_MIN_COIN_CENTS)} coin` : "Max Bet"}
                  </button>
                </div>
                <QuickBetRow
                  amounts={SLOT_COIN_CHIPS}
                  selected={coin}
                  onSelect={setCoinAndClear}
                  lastCoinCents={lastCoin}
                  balanceCents={u.balanceCents}
                  busy={busy || spinning || auto.running}
                  onRepeat={(c) => { setCoinAndClear(c); void go(c); }}
                  minCents={SLOT_COIN_MIN}
                  maxCents={SLOT_COIN_MAX}
                />
              </div>
              <button
                type="button"
                className="btn primary hero-act vault-spin"
                disabled={busy && !spinning}
                onClick={onPrimary}
                aria-label={spinning ? "Stop reels" : `Spin for ${money(coinIn)}`}
              >
                {spinning ? "Stop" : `Spin · ${money(coinIn)}`}
              </button>
            </div>
          </ActionDock>
        </div>
        );
      }}
    </Shell>
  );
}
