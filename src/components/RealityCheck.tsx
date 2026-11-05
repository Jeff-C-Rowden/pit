"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, money } from "./useUser";
import { chicagoTime } from "@/lib/limitText";
import type { SessionData } from "./SessionPanel";

/**
 * Reality check: a plain, non-modal note with the real session time and ledger net.
 * It never covers the table, never pauses a hand, and "Keep playing" and "Take a break"
 * are equal-weight buttons.
 */
export default function RealityCheck() {
  const [d, setD] = useState<SessionData | null>(null);
  const [acked, setAcked] = useState(0);
  const refresh = useCallback(() => { api("/api/session").then(setD).catch(() => {}); }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    const on = () => refresh();
    window.addEventListener("pit:session", on); window.addEventListener("pit:balance", on);
    return () => { clearInterval(t); window.removeEventListener("pit:session", on); window.removeEventListener("pit:balance", on); };
  }, [refresh]);
  const key = d?.session.startedAt ? `pit.rc.${d.session.startedAt}` : null;
  useEffect(() => { if (key) { try { setAcked(Number(localStorage.getItem(key) || 0)); } catch {} } }, [key]);
  if (!d) return null;
  const net = d.session.netCents;
  const netTxt = `${net >= 0 ? "+" : "−"}${money(Math.abs(net))}`;
  if (d.blocked) {
    return (
      <div className="reality-note blocked" role="status">
        <b>Session time limit reached</b>
        <span>You set this limit. New bets open after a 30-minute break, at {chicagoTime(d.blocked.breakEndsAt)}. Anything already in play still settles. This session: net {netTxt}.</span>
        <div className="reality-acts"><Link className="btn" href="/wallet">Your activity</Link></div>
      </div>
    );
  }
  const every = d.reality.minutes;
  if (!every || !d.session.active) return null;
  const due = Math.floor(d.session.minutes / every);
  if (due < 1 || due <= acked) return null;
  const ack = () => { setAcked(due); try { if (key) localStorage.setItem(key, String(due)); } catch {} };
  return (
    <div className="reality-note" role="status">
      <b>You&apos;ve played {d.session.minutes} min · net {netTxt}</b>
      <span>Reality check every {every} min. Net is wins minus bets this session, from your ledger. Sandbox chips only.</span>
      <div className="reality-acts">
        <button type="button" className="btn" onClick={ack}>Keep playing</button>
        <Link className="btn" href="/wallet" onClick={ack}>Take a break · see activity</Link>
      </div>
    </div>
  );
}
