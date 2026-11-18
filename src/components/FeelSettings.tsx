"use client";
// SS3: "Sound & feel" settings — separate, remembered Music / Effects / Haptics switches (all off by default).
// FeelPanel is the inline list (also in the phone menu); FeelSheet is the bottom sheet opened from the
// top-bar speaker and the cabinet sound pill. MusicKeeper starts the quiet pad after the first tap
// when Music is on (browsers need a gesture) and pauses it while the tab is hidden.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FEEL_CHANNELS, FEEL_DEFAULT, FEEL_LABEL, feelSummary, type FeelChannel, type FeelState } from "@/lib/feelSettings";
import { feelState, musicOn, playChip, playWinTier, reducedMotion, setFeel, startMusic, stopMusic } from "@/lib/feel";

export function useFeel(): FeelState {
  const [s, setS] = useState<FeelState>(FEEL_DEFAULT);
  useEffect(() => {
    const f = () => setS(feelState());
    f();
    window.addEventListener("pit-sound", f);
    window.addEventListener("storage", f);
    return () => { window.removeEventListener("pit-sound", f); window.removeEventListener("storage", f); };
  }, []);
  return s;
}

export function FeelPanel({ compact = false }: { compact?: boolean }) {
  const s = useFeel();
  const [rm, setRm] = useState(false);
  const [canVibrate, setCanVibrate] = useState(true);
  useEffect(() => {
    setRm(reducedMotion());
    setCanVibrate(typeof navigator !== "undefined" && typeof (navigator as Navigator & { vibrate?: unknown }).vibrate === "function");
  }, []);
  function flip(ch: FeelChannel) {
    const on = !s[ch];
    setFeel(ch, on);
    // A tiny preview so the player knows what they turned on (never a win sound or win buzz pattern bigger than "small").
    if (on && ch === "effects") setTimeout(playChip, 30);
    if (on && ch === "haptics") setTimeout(() => playWinTier("small"), 30);
  }
  return (
    <div className={`feel-panel${compact ? " feel-compact" : ""}`} data-testid="feel-panel">
      {FEEL_CHANNELS.map((ch) => (
        <button
          key={ch}
          type="button"
          role="switch"
          aria-checked={s[ch]}
          className={`feel-row${s[ch] ? " on" : ""}`}
          data-feel={ch}
          onClick={() => flip(ch)}
        >
          <span className="feel-text">
            <span className="feel-title">{FEEL_LABEL[ch].title}</span>
            {!compact && <span className="feel-detail">{FEEL_LABEL[ch].detail}</span>}
            {!compact && ch === "haptics" && rm && <span className="feel-detail feel-warn">Reduce Motion is on, so haptics stay off.</span>}
            {!compact && ch === "haptics" && !rm && !canVibrate && <span className="feel-detail feel-warn">This browser has no vibration support.</span>}
          </span>
          <span className="feel-switch" aria-hidden><i /></span>
        </button>
      ))}
      {!compact && <p className="feel-note">Off by default · remembered on this device · sounds are synthesized in your browser.</p>}
    </div>
  );
}

export function FeelSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="feel-scrim" onClick={onClose}>
      <div className="feel-sheet" role="dialog" aria-modal="true" aria-label="Sound and feel" onClick={(e) => e.stopPropagation()}>
        <div className="feel-head">
          <strong>Sound &amp; feel</strong>
          <button type="button" className="feel-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <FeelPanel />
      </div>
    </div>,
    document.body,
  );
}

/** Short summary for a pill ("OFF", "FX · BUZZ", "ALL ON"). */
export function useFeelSummary(): string {
  return feelSummary(useFeel());
}

export function MusicKeeper() {
  useEffect(() => {
    const kick = () => { if (musicOn()) startMusic(); };
    const vis = () => { if (document.hidden) stopMusic(); else kick(); };
    window.addEventListener("pointerdown", kick, { passive: true });
    window.addEventListener("keydown", kick);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);
  return null;
}
