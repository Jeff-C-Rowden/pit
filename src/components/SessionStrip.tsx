"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, money } from "./useUser";
import { countBets, fmtMinutes, nudgeDue, nudgeBlock } from "@/lib/sessionStrip";

type Data = { session: { active: boolean; startedAt: string | null; minutes: number; netCents: number }; rows: { type: string; amountCents: number }[]; tournamentBets?: number };

/**
 * Compact session summary (time, real ledger net, bets) with a gentle 30-minute break nudge.
 * Non-modal, never covers a table, dismissible; dismissal lives in sessionStorage for this session.
 */
export default function SessionStrip() {
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(0);
  const refresh = useCallback(() => { api("/api/session/activity").then(setD).catch(() => {}); }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    window.addEventListener("pit:balance", refresh); window.addEventListener("pit:session", refresh);
    return () => { clearInterval(t); window.removeEventListener("pit:balance", refresh); window.removeEventListener("pit:session", refresh); };
  }, [refresh]);
  const key = d?.session.startedAt ? `pit.nudge.${d.session.startedAt}` : null;
  useEffect(() => { if (key) { try { setDismissed(Number(sessionStorage.getItem(key) || 0)); } catch {} } }, [key]);
  if (!d || !d.session.active) return null;
  const { minutes, netCents } = d.session;
  const bets = countBets(d.rows) + (d.tournamentBets ?? 0);
  const netTxt = `${netCents >= 0 ? "+" : "−"}${money(Math.abs(netCents))}`;
  const due = nudgeDue(minutes, dismissed);
  const dismiss = () => { const b = nudgeBlock(minutes); setDismissed(b); try { if (key) sessionStorage.setItem(key, String(b)); } catch {} };
  return (
    <div className="session-strip" aria-label="Session summary">
      <button type="button" className="session-strip-chip" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="session-strip-dot" aria-hidden="true" />
        <span>Session {fmtMinutes(minutes)}</span>
        <span className={netCents > 0 ? "pos" : netCents < 0 ? "neg" : ""}>Net {netTxt}</span>
        <span>{bets} {bets === 1 ? "bet" : "bets"}</span>
      </button>
      {open && (
        <p className="session-strip-detail muted">
          Sandbox / test chips. Net is payouts minus bets this session, straight from your ledger. The bet count includes tournament bets, which use tourney chips and never change Net. A session ends after 30 minutes with no bet.{" "}
          <Link href="/wallet#time">Set limits &amp; breaks</Link> · <Link href="/activity">Activity</Link> · Help: 1-800-GAMBLER · 21+
        </p>
      )}
      {due && (
        <div className="session-strip-nudge" role="status">
          <span>You&apos;ve been playing {fmtMinutes(minutes)}. A short stretch break is always fine. Sandbox chips only.</span>
          <span className="reality-acts">
            <button type="button" className="btn" onClick={dismiss}>Keep playing</button>
            <Link className="btn" href="/wallet#time" onClick={dismiss}>Take a break</Link>
          </span>
        </div>
      )}
    </div>
  );
}
