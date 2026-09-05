"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { ActionDock, ChipRow, ChipStack, OutcomeBanner } from "@/components/TableUX";
import { StandingRail } from "@/components/Seating";
import { api, money, useUser } from "@/components/useUser";

const LAST_KEY = "pit-cr-last";

type PatternBet = { type: string; amount: number; number?: number; id?: string };

function layoutFromTable(t: any): PatternBet[] {
  if (!t) return [];
  const a: PatternBet[] = [];
  const push = (type: string, amount: number, extra?: Record<string, unknown>) => {
    if (amount) a.push({ type, amount, ...extra });
  };
  push("pass", t.pass || 0);
  push("passOdds", t.passOdds || 0);
  push("dontPass", t.dontPass || 0);
  push("dontPassOdds", t.dontPassOdds || 0);
  push("field", t.field || 0);
  push("anySeven", t.anySeven || 0);
  push("anyCraps", t.anyCraps || 0);
  push("yo", t.yo || 0);
  for (const n of [4, 5, 6, 8, 9, 10]) push("place", t.place?.[String(n)] || 0, { number: n });
  for (const n of [4, 6, 8, 10]) push("hard", t.hard?.[String(n)] || 0, { number: n });
  const come = (t.come || []).reduce((n: number, c: any) => n + (c.amount || 0), 0);
  const dc = (t.dontCome || []).reduce((n: number, c: any) => n + (c.amount || 0), 0);
  push("come", come);
  push("dontCome", dc);
  return a;
}

function BoxChip({ cents }: { cents: number }) {
  if (!cents) return <div className="muted">$0.00</div>;
  return (
    <div className="chip-on-num" style={{ position: "relative", transform: "none", left: "auto", top: "auto" }}>
      <ChipStack cents={cents} size={30} maxChips={6} />
    </div>
  );
}

export default function CrapsPage() {
  const { setUser } = useUser();
  const [table, setTable] = useState<any>(null);
  const [chip, setChip] = useState(500);
  const [err, setErr] = useState<string | null>(null);
  const [lastPay, setLastPay] = useState<number | null>(null);
  const [repeatNote, setRepeatNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastPattern, setLastPattern] = useState<PatternBet[]>([]);

  function remember(pattern: PatternBet[]) {
    if (!pattern.length) return;
    setLastPattern(pattern);
    try { sessionStorage.setItem(LAST_KEY, JSON.stringify(pattern)); } catch { /* ignore */ }
  }

  async function load() {
    const d = await api("/api/games/craps");
    setTable(d.table);
    if (d.user) setUser(d.user);
    if (d.table?.lastRound?.length) remember(d.table.lastRound);
    else {
      try {
        const raw = sessionStorage.getItem(LAST_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) setLastPattern(parsed);
        }
      } catch { /* ignore */ }
    }
  }
  useEffect(() => { load().catch((e) => setErr(e.message)); }, []);

  async function bet(b: Record<string, unknown>) {
    setErr(null);
    setRepeatNote(null);
    setBusy(true);
    try {
      const d = await api("/api/games/craps", {
        method: "POST",
        body: JSON.stringify({ action: "bet", bet: { ...b, amount: chip }, idempotencyKey: crypto.randomUUID() }),
      });
      setTable(d.table);
      if (d.user) setUser(d.user);
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
  }
  async function roll() {
    setErr(null);
    setRepeatNote(null);
    setBusy(true);
    try {
      const snap = layoutFromTable(table);
      if (snap.length) remember(snap);
      const d = await api("/api/games/craps", { method: "POST", body: JSON.stringify({ action: "roll", idempotencyKey: crypto.randomUUID() }) });
      setTable(d.table);
      if (d.user) setUser(d.user);
      setLastPay(d.payoutCents);
      if (d.table?.lastRound?.length) remember(d.table.lastRound);
      if (d.repeatedCents) setRepeatNote(`Last bet back on the felt · ${money(d.repeatedCents)}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
  }
  async function toggleAlways() {
    setErr(null);
    setBusy(true);
    try {
      const on = !table?.alwaysRepeat;
      const d = await api("/api/games/craps", {
        method: "POST",
        body: JSON.stringify({ action: "always", on, idempotencyKey: crypto.randomUUID() }),
      });
      setTable(d.table);
      if (d.user) setUser(d.user);
      if (d.table?.lastRound?.length) remember(d.table.lastRound);
      setRepeatNote(on ? "Always last bet is on. Every roll restacks this pattern." : "Always last bet is off.");
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
  }
  async function undo() {
    setErr(null);
    setRepeatNote(null);
    setBusy(true);
    try {
      const d = await api("/api/games/craps", { method: "POST", body: JSON.stringify({ action: "undo", idempotencyKey: crypto.randomUUID() }) });
      setTable(d.table);
      if (d.user) setUser(d.user);
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
  }
  async function repeat() {
    setErr(null);
    setLastPay(null);
    setBusy(true);
    try {
      const d = await api("/api/games/craps", {
        method: "POST",
        body: JSON.stringify({ action: "repeat", bets: lastPattern, idempotencyKey: crypto.randomUUID() }),
      });
      setTable(d.table);
      if (d.user) setUser(d.user);
      setRepeatNote(d.placedCents ? `Put ${money(d.placedCents)} on the felt.` : "Repeat landed.");
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
  }

  const z = (on: boolean) => `zone ${on ? "on" : ""}`;
  const comeAmt = (table?.come || []).reduce((s: number, c: any) => s + (c.amount || 0), 0);
  const dcAmt = (table?.dontCome || []).reduce((s: number, c: any) => s + (c.amount || 0), 0);
  const canRepeat = lastPattern.length > 0 || !!table?.canRepeat;

  return (
    <Shell>
      {(u) => (
        <div className="craps-page" style={{ paddingBottom: 180 }}>
          <div className="rail-label" style={{ marginTop: 18 }}>Craps · American · {table?.comeOut ? "COME-OUT" : `POINT ${table?.point}`}</div>
          {err && <p className="err" style={{ textAlign: "center" }}>{err}</p>}
          {table?.lastRoll && (
            <p style={{ textAlign: "center" }}>
              <span className="dice">{table.lastRoll[0]}</span>
              <span className="dice">{table.lastRoll[1]}</span>
              <span className="muted"> = {table.lastTotal}</span>
            </p>
          )}
          {lastPay != null && lastPay > 0 && (
            <OutcomeBanner
              win
              title="YOU WIN"
              amountCents={lastPay}
              subtitle={`${money(lastPay)} added to your stack`}
            />
          )}
          {lastPay === 0 && (
            <OutcomeBanner
              title="NOTHING PAID"
              subtitle="Nothing paid on that roll."
            />
          )}
          {repeatNote && (
            <OutcomeBanner push title="PUSH" subtitle={repeatNote} />
          )}
          <div className="felt-table felt-rect craps-felt">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
              {[4,5,6,8,9,10].map((n) => (
                <div key={n} className={z(!!table?.place?.[String(n)])} onClick={() => bet({ type: "place", number: n })}>
                  Place {n}
                  <BoxChip cents={table?.place?.[String(n)] || 0} />
                </div>
              ))}
            </div>
            <div className={z(!!table?.field)} style={{ margin: "8px 0" }} onClick={() => bet({ type: "field" })}>
              Field 2,3,4,9,10,11,12 · 2 pays 2:1 · 12 pays 3:1
              <BoxChip cents={table?.field || 0} />
            </div>
            <div className={z(!!table?.come?.length)} style={{ minHeight: 70 }} onClick={() => bet({ type: "come" })}>
              Come {table?.come?.map((c: any) => `${money(c.amount)}${c.point ? "@"+c.point : ""}`).join(" · ")}
              <BoxChip cents={comeAmt} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, margin: "8px 0" }}>
              <div className={z(!!table?.dontPass)} onClick={() => bet({ type: "dontPass" })}>
                Don&apos;t pass bar
                <BoxChip cents={table?.dontPass || 0} />
              </div>
              <div className={z(!!table?.dontCome?.length)} onClick={() => bet({ type: "dontCome" })}>
                Don&apos;t come
                <BoxChip cents={dcAmt} />
              </div>
            </div>
            <div className={z(!!table?.pass)} onClick={() => bet({ type: "pass" })}>
              Pass line
              <BoxChip cents={table?.pass || 0} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 10 }}>
              <div className="zone" onClick={() => bet({ type: "anySeven" })}>Any 7 4:1<BoxChip cents={table?.anySeven || 0} /></div>
              <div className="zone" onClick={() => bet({ type: "anyCraps" })}>Any craps 7:1<BoxChip cents={table?.anyCraps || 0} /></div>
              <div className="zone" onClick={() => bet({ type: "yo" })}>Yo 11 15:1<BoxChip cents={table?.yo || 0} /></div>
              {[4,6,8,10].map((n) => (
                <div key={n} className="zone" onClick={() => bet({ type: "hard", number: n })}>
                  Hard {n}<BoxChip cents={table?.hard?.[String(n)] || 0} />
                </div>
              ))}
              <div className="zone" onClick={() => bet({ type: "passOdds" })}>Pass odds<BoxChip cents={table?.passOdds || 0} /></div>
              <div className="zone" onClick={() => bet({ type: "dontPassOdds" })}>Don&apos;t odds<BoxChip cents={table?.dontPassOdds || 0} /></div>
            </div>
          </div>
          <StandingRail youName={u.displayName} youStack={u.balanceCents} />
          {table?.log && <div className="panel log" style={{ marginTop: 12 }}>{table.log.slice().reverse().map((l: string, i: number) => <div key={i}>{l}</div>)}</div>}
          <ActionDock hint={table?.alwaysRepeat
            ? "Always last bet is on. Each roll puts the same chips back."
            : canRepeat
              ? "Repeat restacks the last round. Always last bet keeps doing that every roll."
              : "Drop a chip, then Roll. Repeat remembers that round."}>
            <ChipRow amounts={[100, 500, 1000, 2500]} selected={chip} onSelect={setChip} minCents={100} maxCents={500_000} />
            <button className="btn" disabled={busy || !table?.canUndo} onClick={undo}>Undo</button>
            <button className="btn" disabled={busy || !canRepeat} onClick={repeat}>Repeat</button>
            <button className={`btn toggle${table?.alwaysRepeat ? " on" : ""}`} disabled={busy} onClick={toggleAlways}>
              Always last bet {table?.alwaysRepeat ? "on" : "off"}
            </button>
            <button className="btn primary hero-act" disabled={busy} onClick={roll}>Roll</button>
          </ActionDock>
        </div>
      )}
    </Shell>
  );
}
