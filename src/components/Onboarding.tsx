"use client";
import { useEffect, useState } from "react";
import { api, money, useUser, type User } from "./useUser";
import { ONBOARD_KEY, TOUR_STEPS, WELCOME_CHIPS_CENTS, isLast, nextStep, prevStep, welcomeKey } from "@/lib/onboarding/tour";

export default function Onboarding({ user }: { user: User }) {
  const { refresh } = useUser();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try { if (!localStorage.getItem(`${ONBOARD_KEY}:${user.id}`)) setOpen(true); } catch { setOpen(true); }
  }, [user.id]);

  function close() {
    try { localStorage.setItem(`${ONBOARD_KEY}:${user.id}`, "1"); } catch {}
    setOpen(false);
  }

  async function claim() {
    setBusy(true); setErr(null);
    try {
      await api("/api/wallet/deposit", {
        method: "POST",
        body: JSON.stringify({ amountCents: WELCOME_CHIPS_CENTS, idempotencyKey: welcomeKey(user.id) }),
      });
      setClaimed(true);
      await refresh();
      setStep(nextStep(0));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "could not add chips");
    } finally { setBusy(false); }
  }

  if (!open) return null;
  const s = TOUR_STEPS[step];
  return (
    <div className="onb-backdrop" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <div className="onb-card">
        <div className="sandbox-chip">Sandbox · test chips · 21+</div>
        <div className="onb-dots" aria-label={`Step ${step + 1} of ${TOUR_STEPS.length}`}>
          {TOUR_STEPS.map((_, i) => <span key={i} className={`onb-dot${i === step ? " on" : ""}`} />)}
        </div>
        {step === 0 && <div className="onb-chip-stack" aria-hidden><span /><span /><span /></div>}
        <h2 id="onb-title">{s.title}</h2>
        <p className="muted">{s.body}</p>
        {err && <p className="err">{err}</p>}
        <div className="onb-actions">
          {step === 0 ? (
            <>
              <button type="button" className="btn primary" disabled={busy || claimed} onClick={claim}>
                {busy ? "Adding…" : `Claim ${money(WELCOME_CHIPS_CENTS)} sandbox chips`}
              </button>
              <button type="button" className="btn" onClick={() => setStep(1)}>Skip chips</button>
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => setStep(prevStep(step))}>Back</button>
              <button type="button" className="btn primary" onClick={() => (isLast(step) ? close() : setStep(nextStep(step)))}>
                {isLast(step) ? "Hit the floor" : "Next"}
              </button>
            </>
          )}
        </div>
        <button type="button" className="onb-skip" onClick={close}>Skip tour</button>
      </div>
    </div>
  );
}
