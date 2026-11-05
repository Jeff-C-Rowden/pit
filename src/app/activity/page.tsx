"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api, money, useUser } from "@/components/useUser";
import { chicagoTime } from "@/lib/limitText";

type Row = { at: string; type: string; game: string | null; amountCents: number; balanceAfterCents: number };
type Data = { session: { active: boolean; startedAt: string | null; minutes: number; netCents: number }; rows: Row[] };
const GAME: Record<string, string> = { blackjack: "Blackjack", roulette: "Roulette", craps: "Craps", paigow: "Pai Gow", holdem: "Hold'em", slot: "Slots", slots: "Slots" };
const signed = (c: number) => `${c >= 0 ? "+" : "−"}${money(Math.abs(c))}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", second: "2-digit" });

/** This session's bets, payouts and refunds, straight from the ledger. Nothing is summarised away. */
export default function ActivityPage() {
  const { user } = useUser();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (user) api("/api/session/activity").then(setD).catch((e) => setErr(e instanceof Error ? e.message : "failed")); }, [user]);
  const bets = d?.rows.filter((r) => r.type === "bet").reduce((a, r) => a - r.amountCents, 0) ?? 0;
  const back = d?.rows.filter((r) => r.type !== "bet").reduce((a, r) => a + r.amountCents, 0) ?? 0;
  return (
    <Shell>
      <section className="card activity-page">
        <h1 className="h-title">This session</h1>
        {!user && <p>Sign in to see your activity.</p>}
        {err && <p className="err" role="alert">{err}</p>}
        {d && !d.session.active && <p>No session right now. A session ends after 30 minutes without a bet or result.</p>}
        {d && d.session.active && (
          <>
            <p className="activity-sum">
              Started {chicagoTime(d.session.startedAt!)} · {d.session.minutes} min<br />
              Bet {money(bets)} · paid back {money(back)} · <b>net {signed(d.session.netCents)}</b>
            </p>
            <p className="lim-help">From your ledger. Sandbox chips, not real money. Times are Chicago time.</p>
            <table className="activity-table">
              <thead><tr><th scope="col">Time</th><th scope="col">Game</th><th scope="col">What</th><th scope="col" className="num">Amount</th></tr></thead>
              <tbody>
                {d.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{time(r.at)}</td>
                    <td>{GAME[r.game || ""] ?? r.game ?? "—"}</td>
                    <td>{r.type === "bet" ? "Bet" : r.type === "payout" ? "Paid" : "Refund"}</td>
                    <td className={`num ${r.amountCents >= 0 ? "pos" : "neg"}`}>{signed(r.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <div className="btn-row" style={{ marginTop: 16 }}>
          <Link className="btn" href="/wallet#time">Time settings &amp; break</Link>
          <Link className="btn" href="/floor">Back to the floor</Link>
        </div>
      </section>
    </Shell>
  );
}
