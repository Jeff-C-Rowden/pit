"use client";
/**
 * #11 Guest demo spin (signup page, after the 21+ gate). One real Buckshot Bars spin with
 * browser-only demo chips: same strips and paytable as real play, CSPRNG stops, no fetch,
 * no account, nothing saved server-side. Ends with the sign-up / $100 welcome chips call.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import BuckshotMachine, { type BuckshotHandle } from "@/components/BuckshotMachine";
import { CabinetKey, CabinetLed } from "@/components/SlotCabinet";
import { SandboxChip } from "@/components/SandboxChip";
import { AntlerShoe } from "@/components/WesternArt";
import { classicShow } from "@/lib/winShow";
import { slotGlowTier } from "@/lib/feel";
import { ledText } from "@/lib/cabinet";
import { formatCents as money } from "@/lib/money";
import {
  DEMO_LABEL, DEMO_RTP_LINE, DEMO_COINS, DEMO_DENOM_CENTS,
  demoResultLine, freshDemo, loadDemo, playDemo, saveDemo, type DemoState,
} from "@/lib/demoSpin";
import { WELCOME_CHIPS_CENTS } from "@/lib/onboarding/tour";

const store = () => { try { return window.sessionStorage; } catch { return null; } };

export default function DemoSpin({ onClaim }: { onClaim: () => void }) {
  const [state, setState] = useState<DemoState>(freshDemo);
  const [shownBalance, setShownBalance] = useState(freshDemo().balanceCents);
  const [spinning, setSpinning] = useState(false);
  const [settled, setSettled] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const machineRef = useRef<BuckshotHandle>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const s = loadDemo(store());
    setState(s);
    setShownBalance(s.balanceCents);
    setSettled(!!s.last);
    setReduced(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const spin = state.last;
  const used = state.spinsLeft <= 0;

  function go() {
    if (spinning) { machineRef.current?.stopAll(); return; }
    if (used) return;
    setErr(null);
    try {
      const next = playDemo(state);
      setShownBalance(state.balanceCents - next.last!.betCents);
      setSettled(false);
      setSpinning(true);
      setState(next);
      saveDemo(store(), next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "demo unavailable");
    }
  }

  const onSpinComplete = useCallback(() => {
    setSpinning(false);
    setSettled(true);
    setShownBalance(state.balanceCents);
    window.setTimeout(() => ctaRef.current?.focus({ preventScroll: true }), 50);
  }, [state.balanceCents]);

  const won = !!(settled && spin && spin.winCents > 0);
  const bet = DEMO_COINS * DEMO_DENOM_CENTS;

  return (
    <section className="demo-spin" aria-labelledby="demo-spin-h" data-testid="demo-spin">
      <div className="demo-head">
        <h2 id="demo-spin-h">Try one spin first</h2>
        <SandboxChip label={DEMO_LABEL} className="demo-chip" />
      </div>
      <p className="demo-sub muted">No account needed. {money(freshDemo().balanceCents)} in demo chips that stay in this browser tab; nothing is saved.</p>
      <BuckshotMachine
        ref={machineRef}
        window={spin?.window ?? null}
        spinning={spinning}
        turbo={false}
        reduced={reduced}
        onSpinComplete={onSpinComplete}
        glow={settled && spin ? slotGlowTier(spin.betCents, spin.winCents) : 0}
        glowLive={false}
        won={won}
        winShows={won ? classicShow(spin!.line, spin!.kind, spin!.winCents) : []}
        topper={
          <div className="cab-topper">
            <div className="cab-sign">
              <div className="cab-sign-face">
                <span className="cab-emblem" aria-hidden><AntlerShoe size={34} /></span>
                <span className="cab-sign-title">Buckshot Bars</span>
                <span className="cab-sign-kicker">Demo · 1 line · 3 coins</span>
              </div>
            </div>
          </div>
        }
        side={<div className="bb-play-sign"><span>Play</span><b>3</b><span>coins</span><small>for top award</small></div>}
        deck={
          <div className="cab-deck demo-deck">
            <div className="cab-meters" aria-live="polite">
              <CabinetLed label="Demo credits" cents={shownBalance} tone="blue" />
              <CabinetLed label="Bet" cents={bet} />
              <CabinetLed label="Win" value={ledText(settled && spin ? spin.winCents : 0)} lit={won} />
            </div>
            <div className="cab-console demo-console">
              <CabinetKey
                data-demo-spin
                className={`cab-key-spin${spinning ? " stop" : ""}`}
                onClick={go}
                disabled={used && !spinning}
                aria-label={spinning ? "Stop reels" : used ? "Demo spin used" : `Demo spin, ${money(bet)}`}
              >
                {spinning ? <>Stop<br />reels</> : used ? <>Spin<br />used</> : <>Demo<br />spin</>}
              </CabinetKey>
            </div>
            <p className="cab-deck-note">{DEMO_LABEL} · 21+</p>
          </div>
        }
      />
      <p className="demo-rtp" data-testid="demo-rtp">{DEMO_RTP_LINE}. Same reels, paytable and random stops as real play; no first-spin wins.</p>
      {err && <p className="err" role="alert">{err}</p>}
      {settled && spin && (
        <div className="demo-result" role="status" data-testid="demo-result" data-win={spin.winCents}>
          <p className="demo-result-line">{demoResultLine(spin, money)}</p>
          <p className="muted demo-left">Demo credits left: {money(state.balanceCents)} · they disappear when you close this tab.</p>
          <button type="button" ref={ctaRef} className="btn primary demo-cta" onClick={onClaim} data-testid="demo-cta">
            Sign up · claim {money(WELCOME_CHIPS_CENTS)} sandbox welcome chips
          </button>
          <p className="muted demo-rp">21+ only. Play for fun: sandbox chips have no cash value. Set session, loss and time limits in the Cage after you sign up.</p>
        </div>
      )}
      {!settled && !spinning && !spin && (
        <p className="muted demo-rp">21+ only · one {money(bet)} demo spin · sandbox chips, no cash value</p>
      )}
    </section>
  );
}
