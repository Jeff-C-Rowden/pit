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
    try {
      const d = await api("/api/wallet/deposit", { method: "POST", body: JSON.stringify({ amountCents }) });
      if (d.user) setUser(d.user);
      setMsg(`Sandbox deposit ${money(amountCents)} posted to the ledger.`);
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
  }

  return (
    <Shell>
      {(u) => (
        <>
          <div className="hero" style={{ paddingTop: 36 }}>
            <p className="lede">The cage</p>
            <h1 style={{ fontSize: 48 }}>Wallet</h1>
            <p>Balance {money(u.balanceCents)}</p>
          </div>
          <div className="notice">
            {status ? (
              <>
                <strong>{isSandbox ? "Sandbox" : "Partner not connected"}</strong>
                {" — "}
                {status.message}
                {status.adapter && (
                  <span className="muted"> (adapter: {status.adapter}, mode: {status.mode}{status.live ? ", LIVE" : ""})</span>
                )}
              </>
            ) : (
              <>Sandbox only. “Add test funds” writes a ledger deposit. There is no Stripe, no card, no ACH. A payments adapter exists so a licensed processor can be wired later.</>
            )}
          </div>
          {msg && <p className="ok">{msg}</p>}
          {err && <p className="err">{err}</p>}
          {isSandbox && (
            <div className="panel">
              <h3>Add test funds</h3>
              <div className="btn-row">
                {AMTS.map((a) => (
                  <button key={a} className="btn primary" onClick={() => deposit(u, a)}>{money(a)}</button>
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
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>Withdrawal request</h3>
            <p className="muted">Marks funds pending. Nothing is sent to a bank.</p>
            <label>Amount (cents)</label>
            <input type="number" value={wd} onChange={(e) => setWd(Number(e.target.value))} />
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={async () => {
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
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>Responsible play</h3>
            <p className="muted">Optional limits. Leave blank for none. Enforced on the server.</p>
            <label>Deposit limit (cents, lifetime in this sandbox)</label>
            <input value={depLim} onChange={(e) => setDepLim(e.target.value)} placeholder={u.depositLimitCents == null ? "none" : String(u.depositLimitCents)} />
            <label>Loss limit (cents)</label>
            <input value={lossLim} onChange={(e) => setLossLim(e.target.value)} placeholder={u.lossLimitCents == null ? "none" : String(u.lossLimitCents)} />
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={async () => {
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
        </>
      )}
    </Shell>
  );
}
