"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Shell from "@/components/Shell";
import VaultSpireMachine, { type WinCell } from "@/components/VaultSpireMachine";
import ProgressiveMeterStrip, { type MeterPublic } from "@/components/ProgressiveMeter";
import { ActionDock, ChipRow, OutcomeBanner } from "@/components/TableUX";
import { api, money, useUser } from "@/components/useUser";
import { VS_PAYLINES, VS_TOTAL_CONTRIBUTION_BPS, type VsSymbol } from "@/lib/games/slotProgressive";

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
  return <>{money(display)}</>;
}

export default function VaultPage() {
  const { user, setUser } = useUser();
  const [info, setInfo] = useState<any>(null);
  const [meters, setMeters] = useState<MeterPublic[]>([]);
  const [spin, setSpin] = useState<any>(null);
  const [grid, setGrid] = useState<VsSymbol[][] | null>(null);
  const [coin, setCoin] = useState(100);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [showOutcome, setShowOutcome] = useState(false);
  const [lastWinCents, setLastWinCents] = useState(0);
  const [hitTierIds, setHitTierIds] = useState<string[]>([]);
  const [jackpotModal, setJackpotModal] = useState<ProgHit[] | null>(null);
  const [reseedBeat, setReseedBeat] = useState(false);
  const [infoSheet, setInfoSheet] = useState<MeterPublic | "game" | null>(null);
  const [maxArmed, setMaxArmed] = useState(false);

  const spinRef = useRef<any>(null);
  spinRef.current = spin;

  const coinIn = coin * 9;
  const contribPreview = Math.floor((coinIn * VS_TOTAL_CONTRIBUTION_BPS) / 10_000);

  const refreshMeters = useCallback(() => {
    api("/api/games/slot-progressive")
      .then((d) => {
        setInfo(d);
        if (d.meters) setMeters(d.meters);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api("/api/games/slot-progressive")
      .then((d) => {
        setInfo(d);
        if (d.meters) setMeters(d.meters);
      })
      .catch((e) => setErr(e.message));
  }, []);

  // Peer drip poll — calm 2.5s ticks while idle
  useEffect(() => {
    if (spinning || busy || jackpotModal) return;
    const t = window.setInterval(refreshMeters, 2500);
    return () => window.clearInterval(t);
  }, [spinning, busy, jackpotModal, refreshMeters]);

  const winCells = useMemo(
    () => (showOutcome ? cellsFromLineWins(spin?.lineWins as LineWin[] | undefined) : []),
    [spin, showOutcome],
  );

  const onSpinComplete = useCallback(() => {
    setSpinning(false);
    setBusy(false);
    setShowOutcome(true);
    const hits = (spinRef.current?.progressiveHits as ProgHit[] | undefined) ?? [];
    if (hits.length) {
      setHitTierIds(hits.map((h) => h.tierId));
      setJackpotModal(hits);
      setReseedBeat(false);
      window.setTimeout(() => setReseedBeat(true), 900);
    }
  }, []);

  async function go() {
    if (busy || spinning) return;
    setErr(null);
    setBusy(true);
    setShowOutcome(false);
    setLastWinCents(0);
    setHitTierIds([]);
    setJackpotModal(null);
    setReseedBeat(false);
    setGrid(null);
    setSpinning(true);
    setMaxArmed(false);
    try {
      const d = await api("/api/games/slot-progressive", {
        method: "POST",
        body: JSON.stringify({ coinCents: coin, idempotencyKey: crypto.randomUUID() }),
      });
      setSpin(d.spin);
      setGrid(d.spin.grid as VsSymbol[][]);
      setLastWinCents(d.spin.winCents || 0);
      if (d.meters) setMeters(d.meters);
      if (d.user) setUser(d.user);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
      setSpinning(false);
      setBusy(false);
    }
  }

  function setCoinAndClear(n: number) {
    setCoin(n);
    setMaxArmed(false);
  }

  function onMaxBet() {
    if (!maxArmed) {
      setMaxArmed(true);
      return;
    }
    setCoin(5000);
    setMaxArmed(false);
  }

  const balance = user?.balanceCents ?? 0;
  const hits = (spin?.progressiveHits as ProgHit[] | undefined) ?? [];
  const hasJackpot = showOutcome && hits.length > 0;
  const lineOnlyWin = showOutcome && !hasJackpot && lastWinCents > 0;

  return (
    <Shell>
      {(u) => (
        <div className="vault-page">
          <div className="vault-topbar">
            <div className="vault-title-block">
              <p className="lede">Progressive video slot</p>
              <h1>Vault Spire</h1>
            </div>
            <div className="vault-badges">
              <span className="sandbox-chip">Sandbox</span>
              <span className="vault-qualify-badge" title="All sandbox bets feed the progressive">
                All bets qualify · {money(contribPreview)} to pots
              </span>
            </div>
          </div>

          {err && <p className="err">{err}</p>}

          <div className="vault-hero">
            <ProgressiveMeterStrip
              meters={meters}
              quiet={spinning || busy}
              hitTierIds={hitTierIds}
              onOpenInfo={(m) => setInfoSheet(m)}
            />

            <div className="vault-stage-wrap">
              <VaultSpireMachine
                grid={grid}
                spinning={spinning}
                winCells={winCells}
                onSpinComplete={onSpinComplete}
              />
            </div>

            <div className="vault-hud-strip" aria-label="Balance bet and win">
              <div className="vault-hud-cell">
                <span className="vault-hud-label">Balance</span>
                <strong>{money(u.balanceCents)}</strong>
              </div>
              <div className="vault-hud-cell">
                <span className="vault-hud-label">Bet</span>
                <strong>{money(coinIn)}</strong>
              </div>
              <div className="vault-hud-cell">
                <span className="vault-hud-label">Win</span>
                <strong className={showOutcome && lastWinCents > 0 ? "vault-win-lit" : ""}>
                  {showOutcome ? <CountUp cents={lastWinCents} active={showOutcome} /> : money(0)}
                </strong>
              </div>
            </div>
          </div>

          {lineOnlyWin && (
            <OutcomeBanner
              win
              title="YOU WIN"
              amountCents={lastWinCents}
              subtitle={`${money(lastWinCents)} added to your stack`}
            />
          )}
          {showOutcome && !hasJackpot && lastWinCents === 0 && (
            <OutcomeBanner title="NO LINE" subtitle="You lose this spin." />
          )}

          {jackpotModal && (
            <div className="vault-jp-modal" role="dialog" aria-modal="true" aria-label="Jackpot">
              <div className="vault-jp-card">
                <div className="sandbox-chip">Demo jackpot</div>
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
                    setJackpotModal(null);
                    refreshMeters();
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

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

          {infoSheet && (
            <div className="vault-sheet-backdrop" onClick={() => setInfoSheet(null)} role="presentation">
              <div className="vault-sheet panel" role="dialog" onClick={(e) => e.stopPropagation()}>
                {infoSheet === "game" ? (
                  <>
                    <h3>Vault Spire</h3>
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
                            <td>{k}</td>
                            <td>{v[0]}</td>
                            <td>{v[1]}</td>
                            <td>{v[2]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <>
                    <h3>{infoSheet.name} progressive</h3>
                    <p>
                      Live pot <strong>{money(infoSheet.progressiveCents)}</strong>
                    </p>
                    <p className="muted">
                      Seed {money(infoSheet.seedCents)}
                      {infoSheet.ceilingCents != null ? ` · must-hit-by ${money(infoSheet.ceilingCents)}` : " · mystery only"}
                      {" · "}
                      {(infoSheet.contributionBps / 100).toFixed(2)}% of coin-in
                    </p>
                    <p className="muted">Hidden trigger is server-side. Not a licensed jackpot.</p>
                  </>
                )}
                <button type="button" className="btn" onClick={() => setInfoSheet(null)}>
                  Close
                </button>
              </div>
            </div>
          )}

          <ActionDock
            busy={busy || spinning}
            hint={spinning ? "Reels in motion…" : "All bets qualify. Pick a coin, then Spin."}
          >
            <div className="vault-dock">
              <div className="vault-dock-bet">
                <div className="vault-total-bet">
                  Total bet <strong>{money(coinIn)}</strong>
                </div>
                <ChipRow
                  amounts={[25, 50, 100, 250, 500]}
                  selected={coin}
                  onSelect={setCoinAndClear}
                  minCents={25}
                  maxCents={5000}
                />
                <button
                  type="button"
                  className={`btn vault-max${maxArmed ? " armed" : ""}`}
                  onClick={onMaxBet}
                  disabled={busy || spinning}
                >
                  {maxArmed ? "Confirm Max $50 coin" : "Max Bet"}
                </button>
              </div>
              <button
                type="button"
                className="btn primary hero-act vault-spin"
                disabled={busy || spinning || balance < coinIn}
                onClick={go}
              >
                Spin · {money(coinIn)}
              </button>
            </div>
          </ActionDock>
        </div>
      )}
    </Shell>
  );
}
