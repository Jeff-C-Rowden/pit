"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api, money, useUser, type User } from "@/components/useUser";

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
  const [wd, setWd] = useState(10000);
  const [depLim, setDepLim] = useState("");
  const [lossLim, setLossLim] = useState("");
  const [list, setList] = useState<unknown[]>([]);
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [busyAmt, setBusyAmt] = useState<number | null>(null);

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
          <div className="notice cage-notice">
            {status ? (
              <>
                <strong>{isSandbox ? "Sandbox deposits" : "Partner not connected"}</strong>
                {" — "}
                {status.message}
                {status.adapter && (
                  <span className="muted"> (adapter: {status.adapter}, mode: {status.mode}{status.live ? ", LIVE" : ""})</span>
                )}
              </>
            ) : (
              <>Sandbox only. “Add test funds” writes a ledger deposit. There is no Stripe, no card, no ACH.</>
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
            <label htmlFor="wd-cents">Amount (cents)</label>
            <input id="wd-cents" type="number" value={wd} onChange={(e) => setWd(Number(e.target.value))} />
            <div className="btn-row cage-actions">
              <button type="button" className="btn" onClick={async () => {
                setErr(null);
                try {
                  const d = await api("/api/wallet/withdraw", { method: "POST", body: JSON.stringify({ amountCents: wd }) });
                  if (d.user) setUser(d.user);
                  setMsg(`Withdrawal ${money(wd)} is pending (${d.withdrawal.id.slice(0,8)}…).`);
                  setList((x) => [d.withdrawal, ...x]);
                } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
              }}>Request withdrawal</button>
            </div>
            {!!list.length && <pre className="log">{JSON.stringify(list, null, 2)}</pre>}
          </div>
          <div className="panel cage-panel">
            <h3>Responsible play</h3>
            <p className="muted">Optional limits. Leave blank for none. Enforced on the server.</p>
            <label htmlFor="dep-lim">Deposit limit (cents, lifetime in this sandbox)</label>
            <input id="dep-lim" value={depLim} onChange={(e) => setDepLim(e.target.value)} placeholder={u.depositLimitCents == null ? "none" : String(u.depositLimitCents)} />
            <label htmlFor="loss-lim">Loss limit (cents)</label>
            <input id="loss-lim" value={lossLim} onChange={(e) => setLossLim(e.target.value)} placeholder={u.lossLimitCents == null ? "none" : String(u.lossLimitCents)} />
            <div className="btn-row cage-actions">
              <button type="button" className="btn" onClick={async () => {
                try {
                  await api("/api/wallet/limits", { method: "POST", body: JSON.stringify({
                    depositLimitCents: depLim === "" ? null : Number(depLim),
                    lossLimitCents: lossLim === "" ? null : Number(lossLim),
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
