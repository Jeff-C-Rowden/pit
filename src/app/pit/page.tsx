"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api, money } from "@/components/useUser";

export default function PitBoss() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api("/api/pit").then(setData).catch((e) => setErr(e.message));
  }, []);
  return (
    <Shell>
      {(u) => (
        <>
          <div className="hero" style={{ paddingTop: 36 }}>
            <p className="lede">Operator</p>
            <h1 style={{ fontSize: 48 }}>Pit boss</h1>
            {!u.isOperator && <p className="err">This desk is locked. Register as {process.env.NEXT_PUBLIC_OPERATOR || "pitboss@pit.local"} to open it.</p>}
          </div>
          {err && <p className="err">{err}</p>}
          {data && (
            <>
              <div className="panel">
                <h3>Players</h3>
                <table className="paytable">
                  <thead><tr><th>Email</th><th>Name</th><th>Balance</th><th>Opened</th></tr></thead>
                  <tbody>
                    {data.users.map((p: any) => (
                      <tr key={p.id}><td>{p.email}</td><td>{p.display_name}</td><td>{money(p.balance_cents)}</td><td className="muted">{p.created_at}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="panel" style={{ marginTop: 16 }}>
                <h3>Open bets / tables</h3>
                <table className="paytable">
                  <thead><tr><th>Game</th><th>User</th><th>Id</th><th>Updated</th></tr></thead>
                  <tbody>
                    {data.openBets.map((b: any) => (
                      <tr key={b.id}><td>{b.game}</td><td className="mono">{b.user_id.slice(0,8)}</td><td className="mono">{b.id.slice(0,8)}</td><td>{b.updated_at}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="panel" style={{ marginTop: 16 }}>
                <h3>Ledger</h3>
                <table className="paytable">
                  <thead><tr><th>When</th><th>Email</th><th>Type</th><th>Amount</th><th>Bal</th><th>Game</th></tr></thead>
                  <tbody>
                    {data.ledger.map((l: any) => (
                      <tr key={l.id}>
                        <td className="muted">{l.created_at.slice(11,19)}</td>
                        <td>{l.email}</td>
                        <td>{l.type}</td>
                        <td>{money(l.amount_cents)}</td>
                        <td>{money(l.balance_after_cents)}</td>
                        <td>{l.game || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Shell>
  );
}
