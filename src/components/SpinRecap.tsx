"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SandboxChip } from "@/components/SandboxChip";
import {
  addRecapSpin,
  EMPTY_RECAP,
  RECAP_EMPTY,
  RECAP_NOTE,
  recapRows,
  recapSummary,
  type RecapState,
} from "@/lib/spinRecap";

/** Per-machine recap of settled spins this visit. Call `add` only once a spin (and any feature) has settled. */
export function useSpinRecap() {
  const [recap, setRecap] = useState<RecapState>(EMPTY_RECAP);
  const add = useCallback((betCents: number, winCents: number, feature?: boolean) => {
    setRecap((s) => addRecapSpin(s, { betCents, winCents, feature }));
  }, []);
  return { recap, add };
}

/**
 * Slot Scout S4 recap sheet, opened from the cabinet Win meter. role=dialog,
 * focus moves to Close, Tab stays inside, Esc / backdrop / Close dismiss and
 * focus returns to the Win meter. Portaled to <body> so the phone bet dock
 * cannot cover it. No animation, no colour-only meaning (net carries a sign).
 */
export function SpinRecapSheet({ recap, onClose }: { recap: RecapState; onClose: () => void }) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeCb = useRef(onClose);
  closeCb.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCb.current();
        return;
      }
      if (e.key !== "Tab" || !boxRef.current) return;
      const f = Array.from(boxRef.current.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])'));
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!boxRef.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  const rows = recapRows(recap);
  const sum = recapSummary(recap);
  return createPortal(
    <div className="vault-sheet-backdrop recap-backdrop" onClick={onClose} role="presentation">
      <div
        ref={boxRef}
        className="vault-sheet panel recap-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="spin-recap"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="recap-head">
          <h3 id={titleId}>Session recap</h3>
          <SandboxChip />
        </div>
        <dl className="recap-sum">
          <div><dt>Spins</dt><dd>{sum.spins}</dd></div>
          <div><dt>Bet</dt><dd>{sum.bet}</dd></div>
          <div><dt>Won</dt><dd>{sum.won}</dd></div>
          <div className={`recap-net ${sum.tone}`}><dt>Session net</dt><dd data-testid="recap-net">{sum.net}</dd></div>
        </dl>
        {rows.length === 0 ? (
          <p className="recap-empty">{RECAP_EMPTY}</p>
        ) : (
          <table className="recap-table">
            <caption>Last {rows.length} spin{rows.length === 1 ? "" : "s"}, newest first</caption>
            <thead><tr><th scope="col">#</th><th scope="col">Bet</th><th scope="col">Win</th><th scope="col">Net</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.n} className={r.tone}>
                  <td>{r.n}{r.feature && <span className="recap-feat" title="Bonus feature included"> ★<span className="sr-only"> bonus feature included</span></span>}</td>
                  <td>{r.bet}</td>
                  <td>{r.win}</td>
                  <td>{r.net}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="recap-note">{RECAP_NOTE}</p>
        <button ref={closeRef} type="button" className="btn recap-close" onClick={onClose}>Close</button>
      </div>
    </div>,
    document.body,
  );
}
