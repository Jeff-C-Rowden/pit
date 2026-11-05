"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api, money, useUser, type User } from "@/components/useUser";
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
  const [depLim, setDepLim] = useState("");
  const [lossLim, setLossLim] = useState("");
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
            <p className="lede">The cage</p>
            <h1>Wallet</h1>
            <div className="cage-balance" aria-live="polite">
              <span className="sandbox-chip">Sandbox</span>
              <span className="cage-balance-amt">{money(u.balanceCents)}</span>
            </div>
            <p className="muted">Ledger balance · no card · no ACH</p>
          </div>
          <div className="notice cage-notice" role="note">
            <strong className="cage-notice-title">{isSandbox ? "Practice money only" : "Partner not connected"}</strong>
            {isSandbox ? (
              <ul className="cage-notice-list">
                <li><b>Add test funds</b> gives you free practice chips.</li>
                <li><b>Withdrawals</b> just set chips aside as pending. No money is ever sent.</li>
                <li><b>No card, no bank,</b> nothing to pay, ever.</li>
              </ul>
            ) : status && <p>{status.message}</p>}
            {status?.adapter && (
              <span className="muted cage-notice-meta">Wallet: {status.adapter} · {status.mode}{status.live ? " · LIVE" : ""}</span>
            )}
          </div>
          {msg && <p className="ok cage-flash" role="status">{msg}</p>}
          {err && <p className="err">{err}</p>}
          {isSandbox && (
            <div className="panel cage-panel">
              <h3>Add test funds</h3>
              <p className="muted cage-help">Tap an amount. Credits hit your stack immediately on the server ledger.</p>
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
            <p className="muted">Optional limits. Leave blank for none. Enforced on the server.</p>
            <label htmlFor="dep-lim">Deposit limit ($, lifetime in this sandbox)</label>
            <input id="dep-lim" value={depLim} onChange={(e) => setDepLim(e.target.value)} inputMode="decimal" placeholder={u.depositLimitCents == null ? "none" : centsToInput(u.depositLimitCents)} />
            <label htmlFor="loss-lim">Loss limit ($)</label>
            <input id="loss-lim" value={lossLim} onChange={(e) => setLossLim(e.target.value)} inputMode="decimal" placeholder={u.lossLimitCents == null ? "none" : centsToInput(u.lossLimitCents)} />
            <div className="btn-row cage-actions">
              <button type="button" className="btn" onClick={async () => {
                setErr(null);
                const dl = depLim.trim() === "" ? null : parseDollarsInput(depLim);
                const ll = lossLim.trim() === "" ? null : parseDollarsInput(lossLim);
                if ((depLim.trim() !== "" && dl == null) || (lossLim.trim() !== "" && ll == null)) { setErr("Limits are dollar amounts, like 200 or 200.50."); return; }
                try {
                  await api("/api/wallet/limits", { method: "POST", body: JSON.stringify({
                    depositLimitCents: dl,
                    lossLimitCents: ll,
                  }) });
                  setMsg("Limits saved.");
                  location.reload();
                } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
              }}>Save limits</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
