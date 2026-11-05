"use client";
import { useState } from "react";
import { api, money, useUser } from "./useUser";
import { WELCOME_CHIPS_CENTS } from "@/lib/onboarding/tour";

/** Shown when a player is out of sandbox chips: one tap tops up test credits, no trip to the Cage. */
export default function RefillBar() {
  const { user, refresh } = useUser();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!user || user.balanceCents >= 100) return null;
  async function add() {
    setBusy(true); setErr(null);
    try {
      await api("/api/wallet/deposit", { method: "POST", body: JSON.stringify({ amountCents: WELCOME_CHIPS_CENTS, idempotencyKey: crypto.randomUUID() }) });
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add chips"); } finally { setBusy(false); }
  }
  return (
    <div className="refill-bar" role="status">
      <div className="refill-copy">
        <b>{user.balanceCents > 0 ? "Almost out of chips" : "You have no chips yet"}</b>
        <span>Sandbox test credits only, free and with no cash value.</span>
        {err && <span className="err">{err}</span>}
      </div>
      <button type="button" className="btn primary refill-btn" onClick={add} disabled={busy}>
        {busy ? "Adding…" : `Add ${money(WELCOME_CHIPS_CENTS)} chips`}
      </button>
    </div>
  );
}
