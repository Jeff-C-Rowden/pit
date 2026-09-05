"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import SlotMachine, { type WinCell } from "@/components/SlotMachine";
import { ActionDock, ChipRow, ChipStack, OutcomeBanner } from "@/components/TableUX";
import { StandingRail } from "@/components/Seating";
import { api, money, useUser } from "@/components/useUser";
import { PAYLINES, type Symbol } from "@/lib/games/slot";

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
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [showOutcome, setShowOutcome] = useState(false);

  useEffect(() => {
    api("/api/games/slot").then(setInfo).catch((e) => setErr(e.message));
  }, []);

  const winCells = useMemo(
    () => (showOutcome ? cellsFromLineWins(spin?.lineWins as LineWin[] | undefined) : []),
    [spin, showOutcome],
  );

  const onSpinComplete = useCallback(() => {
    setSpinning(false);
    setBusy(false);
    setShowOutcome(true);
  }, []);

  async function go() {
    if (busy || spinning) return;
    setErr(null);
    setBusy(true);
    setShowOutcome(false);
    setGrid(null); // force filler until server result arrives
    setSpinning(true);
    try {
      const d = await api("/api/games/slot", {
        method: "POST",
        body: JSON.stringify({ coinCents: coin, idempotencyKey: crypto.randomUUID() }),
      });
      setSpin(d.spin);
      setGrid(d.spin.grid as Symbol[][]);
      if (d.user) setUser(d.user);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
      setSpinning(false);
      setBusy(false);
    }
  }

  const coinIn = coin * 9;

  return (
    <Shell>
      {(u) => (
        <>
          <div className="hero" style={{ paddingTop: 28 }}>
            <p className="lede">Video slot</p>
            <h1 style={{ fontSize: 48 }}>Gilded Track</h1>
            <p className="muted">9 lines · 5 reels · published RTP 94–96%</p>
          </div>
          {err && <p className="err">{err}</p>}
          <div
            className="felt-table felt-rect"
            style={{ display: "grid", gridTemplateColumns: "1fr 88px", gap: 12, alignItems: "center" }}
          >
            <SlotMachine
              grid={grid}
              spinning={spinning}
              winCells={winCells}
              onSpinComplete={onSpinComplete}
            />
            <div className="felt-spot">
              <ChipStack cents={coinIn} size={34} winning={!!(showOutcome && spin && spin.winCents > 0)} />
              <div className="felt-spot-cap">Coin-in</div>
            </div>
            {showOutcome && spin && spin.winCents > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <OutcomeBanner
                  win
                  amountCents={spin.winCents}
                  message={`You won ${money(spin.winCents)} — added to your stack`}
                />
              </div>
            )}
            {showOutcome && spin && spin.winCents === 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <OutcomeBanner message="No line. You lost this spin." />
              </div>
            )}
          </div>
          <StandingRail youName={u.displayName} youStack={u.balanceCents} coinIn={coinIn} />
          {info && (
            <div className="panel" style={{ marginTop: 24 }}>
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
                      <td>{k}</td>
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
          <ActionDock hint={spinning ? "Reels in motion…" : "Pick a coin size, then Spin."}>
            <ChipRow amounts={[25, 50, 100, 250, 500]} selected={coin} onSelect={setCoin} />
            <button className="btn primary hero-act" disabled={busy || spinning} onClick={go}>
              Spin · {money(coinIn)}
            </button>
          </ActionDock>
        </>
      )}
    </Shell>
  );
}
