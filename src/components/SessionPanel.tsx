"use client";
import { useEffect, useState } from "react";
import { api, money } from "./useUser";
import { chicagoTime } from "@/lib/limitText";

type SV = { minutes: number | null; pending: { minutes: number | null; effectiveAt: string } | null };
export type SessionData = {
  session: { active: boolean; startedAt: string | null; minutes: number; netCents: number; breakEndsAt: string | null };
  reality: SV; sessionLimit: SV; blocked: { endsAt: string; breakEndsAt: string } | null; breakUntil?: string | null;
  choices: { reality: number[]; session: number[] };
};
const mins = (m: number | null) => (m == null ? "Off" : m < 60 || m % 60 ? `${m} min` : `${m / 60} hr`);

export default function SessionPanel() {
  const [d, setD] = useState<SessionData | null>(null);
  const [rc, setRc] = useState(""); const [sl, setSl] = useState("");
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const load = (x: SessionData) => {
    setD(x);
    setRc(String((x.reality.pending ?? x.reality).minutes ?? ""));
    setSl(String((x.sessionLimit.pending ?? x.sessionLimit).minutes ?? ""));
  };
  useEffect(() => { api("/api/session").then(load).catch(() => setErr("Couldn't load session settings.")); }, []);
  if (!d) return null;
  const post = async (body: object, ok: (r: any) => string) => {
    setErr(null); setMsg(null);
    try { const r: any = await api("/api/session", { method: "POST", body: JSON.stringify(body) }); load(r); setMsg(ok(r)); window.dispatchEvent(new Event("pit:session")); }
    catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
  };
  const res = (r: any, k: "reality" | "session", n: string) => r.result[k].applied === "now" ? `${n} is in effect now.` : r.result[k].applied === "pending" ? `${n} change is pending until ${chicagoTime(r.result[k].effectiveAt)}.` : "";
  const row = (kind: "reality" | "session", title: string, help: string, v: SV, val: string, set: (s: string) => void, choices: number[]) => (
    <fieldset className="lim-row">
      <legend>{title}</legend>
      <p className="muted lim-help">{help}</p>
      <p className="cage-cur">Current: <b>{mins(v.minutes)}</b></p>
      {v.pending && (
        <p className="lim-pending" role="status">
          Pending until {chicagoTime(v.pending.effectiveAt)}: {v.pending.minutes == null ? "turn off" : mins(v.pending.minutes)}
          <button type="button" className="btn lim-keep" onClick={() => post({ cancelPending: kind }, () => "Pending change cancelled. Your current setting stays.")}>Keep my current setting</button>
        </p>
      )}
      <select aria-label={`${title} interval`} value={val} onChange={(e) => set(e.target.value)}>
        <option value="">Off</option>
        {choices.map((c) => <option key={c} value={c}>{kind === "reality" ? `Every ${mins(c)}` : mins(c)}</option>)}
      </select>
    </fieldset>
  );
  return (
    <div className="limits-panel session-panel">
      <h4>Time</h4>
      <p className="muted">
        {d.session.active
          ? <>This session: {d.session.minutes} min · net {d.session.netCents >= 0 ? "+" : "−"}{money(Math.abs(d.session.netCents))} (from your ledger).</>
          : <>No session in progress. A session ends after 30 minutes without a bet.</>}
        {" "}Shorter times apply at once; longer or off waits 24 hours.
      </p>
      {row("reality", "Reality check", "A reminder of how long you've played and your real net. It never pauses a hand or roll.", d.reality, rc, setRc, d.choices.reality)}
      {row("session", "Session time limit", "When time is up, new bets stop until you take a 30-minute break. Hands already dealt still finish and pay.", d.sessionLimit, sl, setSl, d.choices.session)}
      {err && <p className="err" role="alert">{err}</p>}
      {msg && <p className="ok" role="status">{msg}</p>}
      <div className="break-box">
        {d.breakUntil
          ? <p className="lim-help" role="status">You&apos;re on a break you chose. New bets open at {chicagoTime(d.breakUntil)}. Anything already in play still finishes.</p>
          : <p className="lim-help">Take a break now: new bets stop for 30 minutes, starting right away. Hands and rolls already in play still finish and pay. This can&apos;t be cut short.</p>}
        <div className="btn-row">
          {!d.breakUntil && <button type="button" className="btn" onClick={() => post({ takeBreak: true }, () => "Break started. New bets are paused for 30 minutes.")}>Take a break now</button>}
          <a className="btn" href="/activity">This session&apos;s activity</a>
        </div>
      </div>
      <div className="btn-row cage-actions">
        <button type="button" className="btn" onClick={() => post({ realityMin: rc || null, sessionMin: sl || null }, (r) => [res(r, "reality", "Reality check"), res(r, "session", "Session limit")].filter(Boolean).join(" ") || "No changes.")}>Save time settings</button>
      </div>
    </div>
  );
}
