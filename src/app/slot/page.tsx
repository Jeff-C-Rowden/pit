"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { ActionDock, ChipRow, ChipStack, OutcomeBanner } from "@/components/TableUX";
import { StandingRail } from "@/components/Seating";
import { api, money, useUser } from "@/components/useUser";

const GLYPH: Record<string, string> = {
  WILD: "✦ WILD",
  CROWN: "♛ CROWN",
  DIAMOND: "◆ DIAMOND",
  ACE: "A ACE",
  CHIP: "● CHIP",
  HORSE: "♞ HORSE",
  LAMP: "✧ LAMP",
  BAR: "▬ BAR",
};

export default function SlotPage() {
  const { setUser } = useUser();
  const [info, setInfo] = useState<any>(null);
  const [spin, setSpin] = useState<any>(null);
  const [coin, setCoin] = useState(100);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/games/slot").then(setInfo).catch((e) => setErr(e.message));
  }, []);

  async function go() {
    setErr(null);
    setBusy(true);
    try {
      const d = await api("/api/games/slot", { method: "POST", body: JSON.stringify({ coinCents: coin, idempotencyKey: crypto.randomUUID() }) });
      setSpin(d.spin);
      if (d.user) setUser(d.user);
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
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
          <div className="felt-table felt-rect" style={{ display: "grid", gridTemplateColumns: "1fr 88px", gap: 12, alignItems: "center" }}>
            <div className="slot-window">
              {[0,1,2,3,4].map((r) => (
                <div className="reel" key={r}>
                  {[0,1,2].map((row) => {
                    const s = spin?.grid?.[r]?.[row] || "BAR";
                    return <div key={row} className={`sym ${s}`}>{GLYPH[s] || s}</div>;
                  })}
                </div>
              ))}
            </div>
            <div className="felt-spot">
              <ChipStack cents={coinIn} size={34} winning={!!(spin && spin.winCents > 0)} />
              <div className="felt-spot-cap">Coin-in</div>
            </div>
            {spin && spin.winCents > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <OutcomeBanner win amountCents={spin.winCents} message={`You won ${money(spin.winCents)} — added to your stack`} />
              </div>
            )}
            {spin && spin.winCents === 0 && (
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
                <thead><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr></thead>
                <tbody>
                  {Object.entries(info.paytable || {}).map(([k, v]: any) => (
                    <tr key={k}><td>{k}</td><td>{v[0]}</td><td>{v[1]}</td><td>{v[2]}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">{info.rtpPublished}</p>
            </div>
          )}
          <ActionDock hint="Pick a coin size, then Spin.">
            <ChipRow amounts={[25, 50, 100, 250, 500]} selected={coin} onSelect={setCoin} />
            <button className="btn primary hero-act" disabled={busy} onClick={go}>Spin · {money(coinIn)}</button>
          </ActionDock>
        </>
      )}
    </Shell>
  );
}
