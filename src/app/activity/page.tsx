"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import Sparkline from "@/components/Sparkline";
import { api, money, useUser } from "@/components/useUser";
import { chicagoTime } from "@/lib/limitText";
import { paidPhrase } from "@/lib/paidPhrase";
import { pauseText, type PauseInfo } from "@/lib/pauseText";

type Row = { at: string; type: string; game: string | null; amountCents: number; balanceAfterCents: number; stakeBackCents?: number };
type Data = { session: { active: boolean; startedAt: string | null; minutes: number; netCents: number }; rows: Row[] };
const GAME: Record<string, string> = { blackjack: "Blackjack", roulette: "Roulette", craps: "Craps", paigow: "Pai Gow", holdem: "Hold'em", slot: "Sundown Trail", slots: "Slots", "vault-spire": "Antler Ridge", buckshot: "Buckshot Bars", mine: "Canary Creek Mine", prairie: "Thunderhoof Prairie" };
const signed = (c: number) => `${c >= 0 ? "+" : "−"}${money(Math.abs(c))}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", second: "2-digit" });

/** This session's bets, payouts and refunds, straight from the ledger. Nothing is summarised away. */
export default function ActivityPage() {
  const { user } = useUser();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pause, setPause] = useState<PauseInfo | null>(null);
  useEffect(() => { if (user) api("/api/session/activity").then(setD).catch((e) => setErr(e instanceof Error ? e.message : "failed")); }, [user]);
  useEffect(() => { if (user) api("/api/session").then(setPause).catch(() => {}); }, [user]);
  const paused = pauseText(pause);
  const bets = d?.rows.filter((r) => r.type === "bet").reduce((a, r) => a - r.amountCents, 0) ?? 0;
  const back = d?.rows.filter((r) => r.type !== "bet").reduce((a, r) => a + r.amountCents, 0) ?? 0;
  return (
    <Shell>
      <section className="card activity-page">
        <h1 className="h-title">This session</h1>
        {!user && <p>Sign in to see your activity.</p>}
        {err && <p className="err" role="alert">{err}</p>}
        {paused && <p className="pause-status" role="status"><span aria-hidden="true" className="pause-dot" />{paused}</p>}
        {d && !d.session.active && <p>No session right now. A session ends after 30 minutes without a bet or result.</p>}
        {d && d.session.active && (
          <>
            <p className="activity-sum">
              Started {chicagoTime(d.session.startedAt!)} · {d.session.minutes} min<br />
              Bet {money(bets)} · paid back {money(back)} · <b>net {signed(d.session.netCents)}</b>
            </p>
            <Sparkline rows={d.rows} />
            <p className="lim-help">From your ledger. Sandbox chips, not real money. Times are Chicago time.</p>
            <table className="activity-table">
              <thead><tr><th scope="col">Time</th><th scope="col">Game</th><th scope="col">What</th><th scope="col" className="num">Amount</th></tr></thead>
              <tbody>
                {d.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{time(r.at)}</td>
                    <td>{GAME[r.game || ""] ?? r.game ?? "—"}</td>
                    <td>{r.type === "bet" ? "Bet" : r.type === "payout" ? <>Paid{r.stakeBackCents != null && r.amountCents > 0 && <span className="activity-split">{paidPhrase(r.amountCents, r.stakeBackCents, money)}</span>}</> : "Refund"}</td>
                    <td className={`num ${r.amountCents >= 0 ? "pos" : "neg"}`}>{signed(r.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ marginTop: 12 }}><a className="btn" href="/api/session/activity?format=csv" download>Download this session (CSV)</a></p>
            <p className="lim-help">The file lists the same ledger rows as above, oldest first, with Chicago and UTC times.</p>
          </>
        )}
        <HistoryExport />
        <div className="btn-row" style={{ marginTop: 16 }}>
          <Link className="btn" href="/wallet#time">Time settings &amp; break</Link>
          <Link className="btn" href="/floor">Back to the floor</Link>
        </div>
      </section>
    </Shell>
  );
}

const chiDay = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
/** "Download all my history": every ledger row (chips added, bets, payouts, refunds) between two Chicago dates. */
function HistoryExport() {
  const today = chiDay(Date.now());
  const [from, setFrom] = useState(() => chiDay(Date.now() - 29 * 86_400_000));
  const [to, setTo] = useState(today);
  const bad = !from || !to ? "Pick both dates." : from > to ? "The start date is after the end date." : null;
  const href = `/api/session/activity?format=csv&scope=all&from=${from}&to=${to}`;
  return (
    <fieldset className="hist-export">
      <legend>Download all my history</legend>
      <div className="hist-quick" role="group" aria-label="Quick ranges">
        {[7, 30, 90].map((n) => { const f = chiDay(Date.now() - (n - 1) * 86_400_000); const on = from === f && to === today;
          return <button key={n} type="button" className={`btn chip-btn${on ? " on" : ""}`} aria-pressed={on} onClick={() => { setFrom(f); setTo(today); }}>Last {n} days</button>; })}
      </div>
      <div className="hist-dates">
        <label>From <input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {bad ? <p className="lim-help" role="alert">{bad}</p> : <a className="btn" href={href} download>Download all my history (CSV)</a>}
      <p className="lim-help">Every ledger row in those Chicago dates, all sessions, oldest first, with a totals row at the end. Up to 366 days per file.</p>
    </fieldset>
  );
}
