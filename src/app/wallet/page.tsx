"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { groupByDay, toDate } from "@/lib/ledgerDays";
import { api, money, useUser, type User } from "@/components/useUser";
import LimitsPanel from "@/components/LimitsPanel";
import SessionPanel from "@/components/SessionPanel";
import { parseDollarsInput, centsToInput } from "@/lib/money";

const AMTS = [1000, 2500, 5000, 10000, 25000, 50000, 100000];

type WalletStatus = {
  adapter: string;
  mode: string;
  live: boolean;
  message: string;
};

export default function WalletPage() {
  const { setUser } = useUser();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [wd, setWd] = useState("100.00");
  const [depLim, setDepLim] = useState<string | null>(null);
  const [lossLim, setLossLim] = useState<string | null>(null);
  const [list, setList] = useState<unknown[]>([]);
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [busyAmt, setBusyAmt] = useState<number | null>(null);
  const [confirmWd, setConfirmWd] = useState<number | null>(null);
  const [wdBusy, setWdBusy] = useState(false);

  useEffect(() => {
    api("/api/wallet/withdraw").then((d) => setList(d.withdrawals || [])).catch(() => null);
    fetch("/api/wallet/status")
      .then((r) => r.json())
      .then((d: WalletStatus) => setStatus(d))
      .catch(() => null);
  }, []);

  const isSandbox = !status || status.mode === "sandbox";

  async function deposit(u: User, amountCents: number) {
    setErr(null); setMsg(null);
    setBusyAmt(amountCents);
    try {
      const d = await api("/api/wallet/deposit", { method: "POST", body: JSON.stringify({ amountCents }) });
      if (d.user) setUser(d.user);
      setMsg(`+${money(amountCents)} posted. New balance ${money(d.user?.balanceCents ?? u.balanceCents + amountCents)}.`);
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
    finally { setBusyAmt(null); }
  }

  return (
    <Shell>
      {(u) => (
        <div className="cage-page">
          <div className="hero cage-hero">
            <h1><span className="cage-kicker">The cage · </span>Wallet</h1>
            <div className="cage-balance" aria-live="polite">
              <span className="sandbox-chip">Sandbox</span>
              <span className="cage-balance-amt">{money(u.balanceCents)}</span>
              <span className="cage-balance-sub muted">ledger · no card · no ACH</span>
            </div>
          </div>
          {isSandbox ? (
            <details className="notice cage-notice cage-notice-fold">
              <summary><strong className="cage-notice-title">Practice money only</strong> <span className="muted">· no card, nothing is ever sent</span></summary>
              <ul className="cage-notice-list">
                <li><b>Add test funds</b> gives you free practice chips.</li>
                <li><b>Withdrawals</b> just set chips aside as pending. No money is ever sent.</li>
                <li><b>No card, no bank,</b> nothing to pay, ever.</li>
              </ul>
              {status?.adapter && (
                <span className="muted cage-notice-meta">Wallet: {status.adapter} · {status.mode}{status.live ? " · LIVE" : ""}</span>
              )}
            </details>
          ) : (
            <div className="notice cage-notice" role="note">
              <strong className="cage-notice-title">Partner not connected</strong>
              {status && <p>{status.message}</p>}
              {status?.adapter && (
                <span className="muted cage-notice-meta">Wallet: {status.adapter} · {status.mode}{status.live ? " · LIVE" : ""}</span>
              )}
            </div>
          )}
          {msg && <p className="ok cage-flash" role="status">{msg}</p>}
          {err && <p className="err">{err}</p>}
          {isSandbox && (
            <div className="panel cage-panel">
              <h3>Add test funds</h3>
              <p className="muted cage-help">Tap an amount. It lands on your balance right away.</p>
              <div className="btn-row cage-amts">
                {AMTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="btn primary cage-amt"
                    disabled={busyAmt != null}
                    onClick={() => deposit(u, a)}
                  >
                    {busyAmt === a ? "Posting…" : money(a)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!isSandbox && (
            <div className="panel">
              <h3>Partner checkout</h3>
              <p className="muted">
                Sandbox test funds are disabled while PIT_PAYMENTS selects partner mode.
                Wire PartnerWalletClient (see src/lib/payments/partner.ts and GO_LIVE.md) before real deposits.
              </p>
            </div>
          )}
          <div className="panel cage-panel">
            <h3>Withdrawal request</h3>
            <p className="muted">Marks funds pending. Nothing is sent to a bank.</p>
            <label htmlFor="wd-amt">Amount</label>
            <div className="cage-money-input"><span aria-hidden="true">$</span>
              <input id="wd-amt" inputMode="decimal" autoComplete="off" value={wd} onChange={(e) => setWd(e.target.value)} placeholder="10.00" aria-describedby="wd-help" />
            </div>
            <p id="wd-help" className="muted cage-help">Minimum $10.00. Up to your balance of {money(u.balanceCents)}.</p>
            {confirmWd == null ? (
              <div className="btn-row cage-actions">
                <button type="button" className="btn" onClick={() => {
                  setErr(null); setMsg(null);
                  const cents = parseDollarsInput(wd);
                  if (cents == null) { setErr("Enter a dollar amount, like 25 or 25.50."); return; }
                  setConfirmWd(cents);
                }}>Review withdrawal</button>
              </div>
            ) : (
              <div className="cage-confirm" role="alertdialog" aria-labelledby="wd-confirm-t">
                <p id="wd-confirm-t"><b>Set aside {money(confirmWd)} as pending?</b></p>
                <p className="muted">It leaves your playable balance now. This is a sandbox: nothing is sent to a bank, and pending requests can&apos;t be cancelled here yet.</p>
                <div className="btn-row cage-actions">
                  <button type="button" className="btn" disabled={wdBusy} onClick={() => setConfirmWd(null)}>Back</button>
                  <button type="button" className="btn primary" disabled={wdBusy} onClick={async () => {
                    setWdBusy(true);
                    try {
                      const d = await api("/api/wallet/withdraw", { method: "POST", body: JSON.stringify({ amountCents: confirmWd }) });
                      if (d.user) setUser(d.user);
                      setMsg(`Withdrawal ${money(confirmWd)} is pending (${d.withdrawal.id.slice(0,8)}…).`);
                      setList((x) => [d.withdrawal, ...x]);
                      setConfirmWd(null);
                    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); setConfirmWd(null); }
                    finally { setWdBusy(false); }
                  }}>{wdBusy ? "Requesting…" : `Confirm ${money(confirmWd)}`}</button>
                </div>
              </div>
            )}
            {!!list.length && (
              <ul className="cage-wd-list" aria-label="Your withdrawal requests">
                {(list as any[]).map((w) => (
                  <li key={w.id}><span>{money(w.amount_cents ?? w.amountCents)}</span><span className={`cage-wd-status st-${w.status}`}>{w.status}</span><span className="muted">{w.created_at ? new Date(w.created_at).toLocaleDateString() : "just now"}</span></li>
                ))}
              </ul>
            )}
          </div>
          <div className="panel cage-panel">
            <h3>Responsible play</h3>
            <LimitsPanel />
            <SessionPanel />
          <CageLedger />
          </div>
        </div>
      )}
    </Shell>
  );
}

type Line = { id: string; type: string; amountCents: number; balanceAfterCents: number; game: string | null; ref: string | null; at: string };

const TYPE_LABEL: Record<string, string> = { bet: "Bet", payout: "Paid", refund: "Returned", deposit: "Added", withdrawal: "Withdrawn" };

/** Recent ledger lines. When the URL carries game & ref (from "View in Cage"), those lines are shown and highlighted. */
function CageLedger() {
  const [recent, setRecent] = useState<Line[]>([]);
  const [matched, setMatched] = useState<Line[]>([]);
  const [focus, setFocus] = useState<{ game: string; ref: string } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const game = q.get("game"), ref = q.get("ref");
    const f = game && ref ? { game, ref } : null;
    setFocus(f);
    const qs = f ? `?game=${encodeURIComponent(f.game)}&ref=${encodeURIComponent(f.ref)}` : "";
    api(`/api/wallet/ledger${qs}`).then((d) => {
      setRecent(d.recent || []);
      setMatched(d.matched || []);
      if (f) setTimeout(() => document.getElementById("ledger")?.scrollIntoView({ block: "start" }), 60);
    }).catch(() => null);
  }, []);
  const ids = new Set(matched.map((l) => l.id));
  const row = (l: Line) => (
    <li key={l.id} className={`ledger-line${ids.has(l.id) ? " hit" : ""}`}>
      <span className="ledger-what">{TYPE_LABEL[l.type] || l.type}{l.game ? ` · ${l.game}` : ""}</span>
      <span className={`mono ${l.amountCents > 0 ? "up" : l.amountCents < 0 ? "down" : ""}`}>{l.amountCents > 0 ? "+" : l.amountCents < 0 ? "−" : ""}{money(Math.abs(l.amountCents))}</span>
      <span className="ledger-bal muted mono">bal {money(l.balanceAfterCents)}</span>
      <span className="ledger-at muted">{toDate(l.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
    </li>
  );
  return (
    <div className="panel cage-ledger" id="ledger">
      <h2>Recent activity</h2>
      {focus && (
        <div className="ledger-focus">
          <p className="muted">Ledger lines for that {focus.game} result.</p>
          {matched.length ? <ul className="ledger-list">{matched.map(row)}</ul> : <p className="muted">No payout line for that result: nothing was paid, so no money moved on it. Your bets are in the full list.</p>}
        </div>
      )}
      {focus && <h3 className="muted" style={{ fontSize: 13, margin: "12px 0 4px" }}>All recent</h3>}
      {recent.length ? groupByDay(recent).map((g) => (
        <section key={g.key} className="ledger-day">
          <h3 className="ledger-day-h">
            <span>{g.label}</span>
            <span className="ledger-day-net">
              Play <b className={g.playNet > 0 ? "up" : g.playNet < 0 ? "down" : ""}>{g.playNet > 0 ? "+" : g.playNet < 0 ? "−" : ""}{money(Math.abs(g.playNet))}</b>
              {g.cashIn ? <> · added {money(g.cashIn)}</> : null}
              {g.cashOut ? <> · out {money(g.cashOut)}</> : null}
            </span>
          </h3>
          <ul className="ledger-list">{g.lines.map(row)}</ul>
        </section>
      )) : <p className="muted">No activity yet.</p>}
    </div>
  );
}
