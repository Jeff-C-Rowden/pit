"use client";

import { useEffect, useId, useRef } from "react";
import { buildPotSheet, type PotMeterLike } from "@/lib/potSheet";

/**
 * J2 "How this pot works" sheet. role=dialog + aria-modal, focus moves to the
 * close button, Tab is trapped inside, Esc / backdrop / Close dismiss, and
 * focus returns to the meter that opened it. No animation.
 */
export default function PotSheet({ meter, onClose }: { meter: PotMeterLike; onClose: () => void }) {
  const sheet = buildPotSheet(meter);
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
      const f = Array.from(
        boxRef.current.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])'),
      );
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

  if (!sheet) return null;
  return (
    <div className="vault-sheet-backdrop pot-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        ref={boxRef}
        className="vault-sheet panel pot-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="pot-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pot-sheet-head">
          <h3 id={titleId}>{sheet.title}</h3>
          <span className="sandbox-chip pot-sheet-sandbox">{sheet.sandbox}</span>
        </div>
        <dl className="pot-sheet-rows">
          {sheet.rows.map((r) => (
            <div key={r.label} className="pot-sheet-row">
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
        {sheet.notes.map((n, i) => (
          <p key={i} className="pot-sheet-note">{n}</p>
        ))}
        {sheet.average && (
          <p className="pot-sheet-avg">
            {sheet.average.text} <em>{sheet.average.caveat}</em>
          </p>
        )}
        <button ref={closeRef} type="button" className="btn pot-sheet-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
