"use client";
import { RemindToggle } from "./ExclusionReminder";
import { useEffect, useState } from "react";
import { api, money } from "./useUser";
import { chicagoTime } from "@/lib/limitText";

type SV = { minutes: number | null; pending: { minutes: number | null; effectiveAt: string } | null };
export type SessionData = {
  session: { active: boolean; startedAt: string | null; minutes: number; netCents: number; breakEndsAt: string | null };
  reality: SV; sessionLimit: SV; blocked: { endsAt: string; breakEndsAt: string } | null; breakUntil?: string | null; breakKind?: "break" | "exclusion" | null;
  choices: { reality: number[]; session: number[]; exclusion?: string[] };
};
const EXCL: Record<string, string> = { "24h": "24 hours", "7d": "7 days", "30d": "30 days" };
const mins = (m: number | null) => (m == null ? "Off" : m < 60 || m % 60 ? `${m} min` : `${m / 60} hr`);

export default function SessionPanel() {
  const [d, setD] = useState<SessionData | null>(null);
  const [rc, setRc] = useState(""); const [ex, setEx] = useState<string | null>(null); const [sl, setSl] = useState("");
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
    <div className="limits-panel session-panel" id="time">
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
          ? <><p className="lim-help" role="status">{d.breakKind === "exclusion" ? "You've excluded yourself from betting." : "You're on a break you chose."} New bets open at {chicagoTime(d.breakUntil)}. Anything already in play still finishes. This can&apos;t be ended early.</p>{d.breakKind === "exclusion" && <RemindToggle until={d.breakUntil} />}</>
          : <p className="lim-help">Take a break now: new bets stop for 30 minutes, starting right away. Hands and rolls already in play still finish and pay. This can&apos;t be cut short.</p>}
        <div className="btn-row">
          {!d.breakUntil && <button type="button" className="btn" onClick={() => post({ takeBreak: true }, () => "Break started. New bets are paused for 30 minutes.")}>Take a break now</button>}
          <a className="btn" href="/activity">This session&apos;s activity</a>
        </div>
      </div>
      <fieldset className="lim-row excl-box">
        <legend>Self-exclusion</legend>
        <p className="muted lim-help">Stop all new bets for longer. It starts the moment you confirm, the server enforces it on every game, and it can&apos;t be ended early. If you already have a pause that ends later, that later time stays.</p>
        {!ex ? (
          <div className="btn-row">
            {(d.choices.exclusion ?? ["24h", "7d", "30d"]).map((c) => <button key={c} type="button" className="btn" onClick={() => setEx(c)}>Exclude {EXCL[c] ?? c}</button>)}
          </div>
        ) : (
          <div className="excl-confirm" role="group" aria-label="Confirm self-exclusion">
            <p><b>Stop new bets for {EXCL[ex] ?? ex}?</b> Until about {chicagoTime(new Date(Date.now() + ({ "24h": 24, "7d": 168, "30d": 720 }[ex] ?? 0) * 3600_000).toISOString())}. You can&apos;t undo this.</p>
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={() => { const c = ex; setEx(null); post({ selfExclude: c, confirm: true }, (r) => `Self-exclusion started. New bets open at ${chicagoTime(r.breakUntil)}.`); }}>Yes, exclude me</button>
              <button type="button" className="btn" onClick={() => setEx(null)}>Not now</button>
            </div>
          </div>
        )}
      </fieldset>
      <div className="btn-row cage-actions">
        <button type="button" className="btn" onClick={() => post({ realityMin: rc || null, sessionMin: sl || null }, (r) => [res(r, "reality", "Reality check"), res(r, "session", "Session limit")].filter(Boolean).join(" ") || "No changes.")}>Save time settings</button>
      </div>
    </div>
  );
}
