"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, money } from "./useUser";
import { SandboxChip } from "./SandboxChip";
import { chicagoTime } from "@/lib/limitText";
import { ackFor, ackKey, checkInDue, fmtNet, fmtPlayed, legacyAckKey, parseAck, CHECKIN_COPY as C, type CheckInAck } from "@/lib/checkIn";
import type { SessionData } from "./SessionPanel";

/**
 * Reality check + SS5 check-ins: a plain, non-modal card with the real session time and ledger net.
 * Shows only if the player turned on a time check-in and/or a session budget check-in in the Cage
 * (both off by default, stored on the server). It never covers the table, never pauses a hand on its
 * own and has no countdown. "Keep playing" and "Take a break" are equal-weight buttons; "Take a break"
 * starts the real server-enforced 30-minute pause on new bets.
 */
export default function RealityCheck() {
  const [d, setD] = useState<SessionData | null>(null);
  const [acked, setAcked] = useState<CheckInAck>({ t: 0, b: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const refresh = useCallback(() => { api("/api/session").then(setD).catch(() => {}); }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    const on = () => refresh();
    window.addEventListener("pit:session", on); window.addEventListener("pit:balance", on);
    return () => { clearInterval(t); window.removeEventListener("pit:session", on); window.removeEventListener("pit:balance", on); };
  }, [refresh]);
  const start = d?.session.startedAt ?? null;
  useEffect(() => {
    if (!start) return;
    try { setAcked(parseAck(localStorage.getItem(ackKey(start)), localStorage.getItem(legacyAckKey(start)))); } catch { setAcked({ t: 0, b: 0 }); }
  }, [start]);
  if (!d) return null;
  const net = d.session.netCents;
  const netTxt = `${net >= 0 ? "+" : "−"}${money(Math.abs(net))}`;
  if (d.breakUntil) {
    return (
      <div className="reality-note blocked" role="status" data-testid="break-note">
        <b>{d.breakKind === "exclusion" ? "Self-exclusion you chose" : "On a break you chose"}</b>
        <span>New bets open at {chicagoTime(d.breakUntil)}. Anything already in play still finishes. It can&apos;t be ended early. This session: net {netTxt}.</span>
        <div className="reality-acts"><Link className="btn" href="/activity">See activity</Link></div>
      </div>
    );
  }
  if (d.blocked) {
    return (
      <div className="reality-note blocked" role="status">
        <b>Session time limit reached</b>
        <span>You set this limit. New bets open after a 30-minute break, at {chicagoTime(d.blocked.breakEndsAt)}. Anything already in play still settles. This session: net {netTxt}.</span>
        <div className="reality-acts"><Link className="btn" href="/activity">See activity</Link></div>
      </div>
    );
  }
  const every = d.reality.minutes;
  const budget = d.budget?.cents ?? null;
  const ci = checkInDue({ active: d.session.active, minutes: d.session.minutes, netCents: net, everyMin: every, budgetCents: budget, ack: acked });
  if (!ci || !start) return null;
  const remember = () => {
    const a = ackFor(ci, acked);
    setAcked(a);
    try { localStorage.setItem(ackKey(start), JSON.stringify(a)); } catch {}
  };
  const pause = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api("/api/session", { method: "POST", body: JSON.stringify({ takeBreak: true }) });
      remember(); setD(r as SessionData);
      window.dispatchEvent(new Event("pit:session"));
    } catch { setErr("Couldn't start the break. You can also start one in Limits & breaks."); }
    finally { setBusy(false); }
  };
  return (
    <section className="reality-note checkin-card" role="status" aria-label={C.title} data-testid="checkin-card">
      <div className="ci-head"><b>{C.title}</b><SandboxChip /></div>
      <dl className="ci-figs">
        <div><dt>{C.played}</dt><dd data-testid="ci-played">{fmtPlayed(d.session.minutes)}</dd></div>
        <div><dt>{C.net}</dt><dd data-testid="ci-net" data-cents={net}>{fmtNet(net)}</dd></div>
      </dl>
      <p className="ci-why">
        {ci.time && every ? C.timeWhy(every) : null}{ci.time && ci.budget ? " " : null}{ci.budget && budget ? C.budgetWhy(budget) : null}
      </p>
      <p className="ci-note">{C.source} {C.calm}</p>
      <div className="reality-acts">
        <button type="button" className="btn" onClick={remember} data-testid="ci-keep">{C.keep}</button>
        <button type="button" className="btn" onClick={pause} disabled={busy} data-testid="ci-break">{C.pause}</button>
      </div>
      <p className="ci-note">{C.breakHelp}</p>
      {err && <p className="err" role="alert">{err}</p>}
      <p className="ci-foot"><Link href="/wallet#time">{C.limits}</Link> · {C.help}</p>
    </section>
  );
}
