"use client";
import { useEffect, useState } from "react";
import { api, money, type User } from "@/components/useUser";

type Status = { amountCents: number; claimedToday: boolean; nextClaimAt: string };

function chicagoClock(iso: string) {
  return new Date(iso).toLocaleString([], { timeZone: "America/Chicago", weekday: "short", hour: "numeric", minute: "2-digit" }) + " CT";
}

/** Once-a-day free sandbox chips. The server decides; this card only reflects its answer. */
export default function DailyClaim({ onUser }: { onUser: (u: User) => void }) {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api("/api/wallet/daily").then(setSt).catch(() => null); }, []);
  if (!st) return null;
  async function claim() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const d = await api("/api/wallet/daily", { method: "POST", body: "{}" });
      if (d.user) onUser(d.user);
      setSt({ amountCents: d.amountCents, claimedToday: true, nextClaimAt: d.nextClaimAt });
      setMsg(`+${money(d.amountCents)} free sandbox chips added. New balance ${money(d.balanceCents)}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "claim failed");
      api("/api/wallet/daily").then(setSt).catch(() => null);
    } finally { setBusy(false); }
  }
  return (
    <div className="panel cage-panel daily-claim" aria-labelledby="daily-claim-t">
      <h3 id="daily-claim-t"><span className="sandbox-chip">Sandbox</span> Daily free chips</h3>
      <p className="muted cage-help">
        {money(st.amountCents)} of practice chips, once per day (resets at midnight Chicago time). Not real money; nothing to pay.
      </p>
      <button type="button" className="btn primary" disabled={busy || st.claimedToday} onClick={claim}>
        {busy ? "Claiming…" : st.claimedToday ? "Claimed today" : `Claim today's free chips · ${money(st.amountCents)}`}
      </button>
      {st.claimedToday && <p className="muted cage-help">Next claim opens {chicagoClock(st.nextClaimAt)}.</p>}
      {msg && <p className="ok" role="status">{msg}</p>}
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}
