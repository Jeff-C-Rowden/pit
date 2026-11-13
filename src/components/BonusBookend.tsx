"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SandboxChip } from "@/components/SandboxChip";
import { balanceBeforeCollect, INTRO_NOTE, spinHasFeature, SUMMARY_NOTE, type BonusIntro, type BonusSummary } from "@/lib/bonusBookends";
import type { User } from "@/components/useUser";

/**
 * Holds a feature spin's win off the displayed Balance until the player
 * collects on the summary card. The server has already settled the spin; the
 * Balance shows the true post-bet amount meanwhile, and the full server user is
 * restored on collect (or if the player leaves the page mid-feature).
 */
export function useFeatureCredit(setUser: (u: User) => void) {
  const pending = useRef<User | null>(null);
  const setRef = useRef(setUser);
  setRef.current = setUser;
  const accept = useCallback((user: User | null | undefined, spin: { winCents?: number; freeSpins?: unknown; pick?: unknown; hold?: unknown; wheel?: unknown } | null | undefined) => {
    if (!user) return;
    if (spinHasFeature(spin)) {
      pending.current = user;
      setRef.current({ ...user, balanceCents: balanceBeforeCollect(user.balanceCents, spin?.winCents ?? 0) });
    } else {
      pending.current = null;
      setRef.current(user);
    }
  }, []);
  const release = useCallback(() => {
    if (pending.current) setRef.current(pending.current);
    pending.current = null;
  }, []);
  useEffect(() => () => { if (pending.current) setRef.current(pending.current); }, []);
  return { accept, release };
}

/**
 * Slot Scout S5 bookend card shell: role=dialog portaled to <body> (so the
 * phone bet dock cannot cover it), focus moves to the one action button, Tab
 * stays inside, Enter / Space press the button and Esc does the same as the
 * button (a won feature cannot be thrown away). No timers and no countdown:
 * nothing happens until the player acts. After it closes, focus goes back to
 * the cabinet Spin button when that is enabled.
 */
function BookendDialog({ theme, testId, action, onAction, children }: { theme: string; testId: string; action: string; onAction: () => void; children: (titleId: string) => ReactNode }) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const cb = useRef(onAction);
  cb.current = onAction;
  useEffect(() => {
    btnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); cb.current(); return; }
      if (e.key !== "Tab" || !boxRef.current) return;
      const f = Array.from(boxRef.current.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])'));
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (!boxRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.requestAnimationFrame(() => {
        const spin = document.querySelector<HTMLButtonElement>("[data-cab-spin]");
        if (spin && !spin.disabled && !document.querySelector("[role=dialog][aria-modal=true]")) spin.focus({ preventScroll: true });
      });
    };
  }, []);
  return createPortal(
    <div className={`mine-modal bookend-modal ${theme}`} role="presentation">
      <div ref={boxRef} className="mine-modal-card bookend-card" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid={testId}>
        {children(titleId)}
        <button ref={btnRef} type="button" className="btn primary bookend-act" data-testid={`${testId}-act`} onClick={onAction}>{action}</button>
      </div>
    </div>,
    document.body,
  );
}

export function BonusIntroCard({ intro, onStart, theme = "", testId = "bonus-intro", note = INTRO_NOTE, wonLabel = "You won:" }: { intro: BonusIntro; onStart: () => void; theme?: string; testId?: string; note?: string; wonLabel?: string }) {
  return (
    <BookendDialog theme={theme} testId={testId} action={intro.start} onAction={onStart}>
      {(id) => (
        <>
          <div className="bookend-head"><p className="mine-kicker">{intro.kicker}</p><SandboxChip /></div>
          <h2 id={id}>{intro.title}</h2>
          <p className="bookend-won">{wonLabel} {intro.won}</p>
          <p className="bookend-rule">{intro.rule}</p>
          <p className="mine-honest bookend-note">{note}</p>
        </>
      )}
    </BookendDialog>
  );
}

export function BonusSummaryCard({ summary, onCollect, theme = "", title = "Feature complete" }: { summary: BonusSummary; onCollect: () => void; theme?: string; title?: string }) {
  return (
    <BookendDialog theme={theme} testId="bonus-summary" action={summary.collect} onAction={onCollect}>
      {(id) => (
        <>
          <div className="bookend-head"><p className="mine-kicker">{title}</p><SandboxChip /></div>
          <h2 id={id} data-testid="bonus-summary-total">{summary.total}</h2>
          {summary.played && <p className="bookend-played" data-testid="bonus-summary-played">Played: {summary.played}</p>}
          <table className="mine-sum-table">
            <tbody>
              {summary.rows.map((r) => <tr key={r.label}><td>{r.label}</td><td>{r.amount}</td></tr>)}
              <tr className="mine-sum-total"><td>Total on a {summary.bet} bet</td><td>{summary.total}</td></tr>
              <tr className={`bookend-net ${summary.tone}`}><td>Net on this spin</td><td data-testid="bonus-summary-net">{summary.net}</td></tr>
            </tbody>
          </table>
          {summary.capped && <p className="muted">{summary.capped}</p>}
          <p className="mine-honest bookend-note">{SUMMARY_NOTE}</p>
        </>
      )}
    </BookendDialog>
  );
}
