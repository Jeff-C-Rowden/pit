"use client";
import { useEffect, useState } from "react";
import { api, money } from "./useUser";
import { PERIOD_LABEL, chicagoTime } from "@/lib/limitText";
import { parseDollarsInput } from "@/lib/money";
import { recordAchievement } from "@/lib/achievements";

type View = { cents: number | null; period: string | null; usedCents: number; resetsAt: string | null;
  pending: { cents: number | null; period: string | null; effectiveAt: string } | null };
type Views = { deposit: View; loss: View };

function Row({ kind, v, amt, setAmt, per, setPer, onKeep }: { kind: "deposit" | "loss"; v: View; amt: string; setAmt: (s: string) => void; per: string; setPer: (s: string) => void; onKeep: () => void }) {
  const label = kind === "deposit" ? "Deposit limit" : "Loss limit";
  return (
    <fieldset className="lim-row">
      <legend>{label}</legend>
      <p className="cage-cur">
        Current: <b>{v.cents == null ? "No limit" : `${money(v.cents)} ${PERIOD_LABEL[v.period || "all"].toLowerCase()}`}</b>
        {v.cents != null && <> · used {money(Math.max(0, v.usedCents))}</>}
      </p>
      {v.cents != null && (() => {
        const used = Math.max(0, v.usedCents); const pct = Math.min(100, Math.round((used / v.cents) * 100));
        const per = v.period === "all" ? "all time" : `this ${v.period}`;
        return (
          <div className="lim-bar-wrap">
            <div className={`lim-bar${pct >= 100 ? " full" : pct >= 80 ? " near" : ""}`} role="meter" aria-valuemin={0} aria-valuemax={v.cents} aria-valuenow={Math.min(used, v.cents)}
              aria-label={`${label}: ${money(used)} of ${money(v.cents)} used ${per}`}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="lim-bar-txt">{money(used)} of {money(v.cents)} used {per} · {money(Math.max(0, v.cents - used))} left</span>
          </div>
        );
      })()}
      {v.cents != null && (
        <p className="lim-reset">{v.resetsAt ? <>Resets {chicagoTime(v.resetsAt)}</> : <>All-time limit from before periods existed. It never resets; pick a period to switch.</>}</p>
      )}
      {v.pending && (
        <p className="lim-pending" role="status">
          Pending until {chicagoTime(v.pending.effectiveAt)}: {v.pending.cents == null ? "remove this limit" : `${money(v.pending.cents)} ${PERIOD_LABEL[v.pending.period || "all"].toLowerCase()}`}
          <button type="button" className="btn lim-keep" onClick={onKeep}>Keep my current limit</button>
        </p>
      )}
      <div className="lim-inputs">
        <input aria-label={`${label} amount in dollars`} value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder="No limit" />
        <select aria-label={`${label} period`} value={per} onChange={(e) => setPer(e.target.value)}>
          <option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option>
        </select>
      </div>
    </fieldset>
  );
}

const toInput = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));
const target = (v: View) => (v.pending ? v.pending : v);

export default function LimitsPanel() {
  const [views, setViews] = useState<Views | null>(null);
  const [dA, setDA] = useState(""); const [dP, setDP] = useState("day");
  const [lA, setLA] = useState(""); const [lP, setLP] = useState("day");
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const load = (vs: Views) => {
    setViews(vs);
    const d = target(vs.deposit), l = target(vs.loss);
    setDA(toInput(d.cents)); setDP(d.period && d.period !== "all" ? d.period : "day");
    setLA(toInput(l.cents)); setLP(l.period && l.period !== "all" ? l.period : "day");
  };
  useEffect(() => { api("/api/wallet/limits").then((d: any) => load(d.limits)).catch(() => setErr("Couldn't load limits.")); }, []);
  if (!views) return <p className="muted">Loading limits…</p>;
  async function keep(kind: "deposit" | "loss") {
    setErr(null); setMsg(null);
    try {
      const d: any = await api("/api/wallet/limits", { method: "POST", body: JSON.stringify({ cancelPending: kind }) });
      load(d.limits); setMsg(`Pending change cancelled. Your current ${kind} limit stays.`);
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
  }
  async function save() {
    setErr(null); setMsg(null);
    const dl = dA.trim() === "" ? null : parseDollarsInput(dA.trim());
    const ll = lA.trim() === "" ? null : parseDollarsInput(lA.trim());
    if ((dA.trim() && dl == null) || (lA.trim() && ll == null)) { setErr("Limits are dollar amounts, like 200 or 200.50."); return; }
    try {
      const d: any = await api("/api/wallet/limits", { method: "POST", body: JSON.stringify({ depositLimitCents: dl, depositPeriod: dP, lossLimitCents: ll, lossPeriod: lP }) });
      load(d.limits);
      if (dl != null || ll != null) recordAchievement({ kind: "limit" });
      const parts = (["deposit", "loss"] as const).map((k) => {
        const r = d.result[k]; const n = k === "deposit" ? "Deposit" : "Loss";
        return r.applied === "now" ? `${n} limit is in effect now.` : r.applied === "pending" ? `${n} limit change is pending until ${chicagoTime(r.effectiveAt)}.` : "";
      }).filter(Boolean);
      setMsg(parts.join(" ") || "No changes.");
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
  }
  return (
    <div className="limits-panel">
      <p className="muted">Enforced on the server. Days, weeks (from Monday) and months reset at midnight Chicago time. Lowering a limit works at once. Raising or removing one waits 24 hours.</p>
      <Row kind="deposit" v={views.deposit} amt={dA} setAmt={setDA} per={dP} setPer={setDP} onKeep={() => keep("deposit")} />
      <Row kind="loss" v={views.loss} amt={lA} setAmt={setLA} per={lP} setPer={setLP} onKeep={() => keep("loss")} />
      {err && <p className="err" role="alert">{err}</p>}
      {msg && <p className="ok" role="status">{msg}</p>}
      <div className="btn-row cage-actions"><button type="button" className="btn" onClick={save}>Save limits</button></div>
    </div>
  );
}
