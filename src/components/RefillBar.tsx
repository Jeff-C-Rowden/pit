"use client";
import { chicagoTime } from "@/lib/limitText";
import { useEffect, useState } from "react";
import { api, money, useUser } from "./useUser";

type Status = { ok: true; amountCents: number; note?: string } | { ok: false; reason: string; message: string; resetsAt?: string | null };

/** Shown when a player is out of sandbox chips. Offers a one-tap top-up only when their own limits allow it. */
export default function RefillBar() {
  const { user, refresh } = useUser();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const low = !!user && user.balanceCents < 100;
  useEffect(() => {
    if (!low) return;
    let live = true;
    fetch("/api/wallet/refill", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d) setStatus(d); }).catch(() => null);
    return () => { live = false; };
  }, [low, user?.depositLimitCents, user?.lossLimitCents]);
  if (!low || !status) return null;
  async function add() {
    if (!status || !status.ok) return;
    setBusy(true); setErr(null);
    try {
      await api("/api/wallet/deposit", { method: "POST", body: JSON.stringify({ amountCents: status.amountCents, idempotencyKey: crypto.randomUUID() }) });
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add chips"); } finally { setBusy(false); }
  }
  if (!status.ok) {
    return (
      <div className="refill-bar limit" role="status">
        <div className="refill-copy">
          <b>{status.reason === "loss_limit" ? "Loss limit reached" : "Deposit limit reached"}</b>
          <span>{status.message}</span>
          <span className="refill-reset">{status.resetsAt ? <>Resets {chicagoTime(status.resetsAt)}.</> : <>This is an all-time limit, so it doesn&apos;t reset. You can change it in the Cage (raising it waits 24 hours).</>}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="refill-bar" role="status">
      <div className="refill-copy">
        <b>{user!.balanceCents > 0 ? "Almost out of chips" : "You have no chips yet"}</b>
        <span>{status.note || "Sandbox test credits only, free and with no cash value."}</span>
        {err && <span className="err">{err}</span>}
      </div>
      <button type="button" className="btn primary refill-btn" onClick={add} disabled={busy}>
        {busy ? "Adding…" : `Add ${money(status.amountCents)} chips`}
      </button>
    </div>
  );
}
