"use client";

import { SandboxChip } from "@/components/SandboxChip";
import { useEffect, useMemo, useState } from "react";
import {
  HIT_HISTORY_EMPTY,
  HIT_HISTORY_PER_TIER,
  HIT_HISTORY_SANDBOX,
  buildHitHistory,
  tierSummary,
  type HitRecordLike,
  type TierConfigLike,
} from "@/lib/hitHistory";
import { ALL_TIER_THEORY, THEORY_NOTE, THEORY_WINDOW, buildTheoryCompare, theoryExplainer, type MetricCompare } from "@/lib/hitTheory";

const ORDER = ["Mini", "Minor", "Major", "Grand"];

/**
 * Jackpot Desk J3 — per-tier hit history. Real progressive_hits only (last 10
 * per tier from GET /api/games/slot-progressive `hitHistory`). Tabs per tier;
 * each row: amount, time ago, meter at hit vs the tier's must-hit-by cap,
 * privacy-safe name. Empty tiers say "No hits yet". No animation.
 */
export default function HitHistoryStrip({
  tiers,
  hits,
  samples,
}: {
  tiers: TierConfigLike[];
  hits: HitRecordLike[] | null | undefined;
  /** JD4: last 50 real hits per tier (amount + recorded cycle coin-in). */
  samples?: unknown;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const ordered = useMemo(
    () => [...tiers].sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name)),
    [tiers],
  );
  const history = useMemo(() => buildHitHistory(hits ?? [], ordered, now), [hits, ordered, now]);
  const theory = useMemo(() => buildTheoryCompare(samples ?? []), [samples]);
  const [sel, setSel] = useState<string | null>(null);
  if (!ordered.length) return null;
  const active = history.find((t) => t.tierId === sel) ?? history[0]!;
  const loading = hits == null;

  return (
    <section className="hh" aria-label="Antler Ridge hit history">
      <div className="hh-head">
        <h2 className="hh-title">Hit history</h2>
        <SandboxChip className="hh-sandbox" />
      </div>
      <div className="hh-tabs" role="tablist" aria-label="Progressive tier">
        {history.map((t) => {
          const on = t.tierId === active.tierId;
          return (
            <button
              key={t.tierId}
              type="button"
              role="tab"
              id={`hh-tab-${t.tierId}`}
              aria-selected={on}
              aria-controls="hh-panel"
              className={`hh-tab hh-tab-${t.name.toLowerCase()}${on ? " on" : ""}`}
              onClick={() => setSel(t.tierId)}
            >
              <span className="hh-tab-name">{t.name}</span>
              <span className="hh-tab-sum">{loading ? "…" : tierSummary(t)}</span>
            </button>
          );
        })}
      </div>
      <div className="hh-panel" id="hh-panel" role="tabpanel" aria-labelledby={`hh-tab-${active.tierId}`}>
        <p className="hh-range">
          {active.rangeLabel} · last {HIT_HISTORY_PER_TIER} real hits
        </p>
        {loading ? (
          <p className="hh-empty">…</p>
        ) : active.empty ? (
          <p className="hh-empty">{HIT_HISTORY_EMPTY}</p>
        ) : (
          <ol className="hh-list">
            {active.rows.map((r) => (
              <li key={r.key} className="hh-row">
                <span className="hh-amt">{r.amountLabel}</span>
                <span className="hh-ago">{r.ago}</span>
                <span className="sr-only">{HIT_HISTORY_SANDBOX}</span>
                <span className="hh-who">{r.who}</span>
                <span className="hh-vs">
                  {r.ceilingPercent != null && (
                    <span className="hh-vs-bar" aria-hidden>
                      <span style={{ width: `${r.ceilingPercent}%` }} />
                    </span>
                  )}
                  <span className="hh-vs-text">{r.vsCeiling}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        {!loading && <TheoryBlock cmp={theory.find((t) => t.tierId === active.tierId)} />}
        <p className="hh-note">Meter amount when each pot paid. Past hits do not change the odds of the next spin.</p>
      </div>
    </section>
  );
}

function MetricRow({ m }: { m: MetricCompare }) {
  return (
    <div className={`hh-tv-row${m.drift ? " drift" : ""}`} data-metric={m.label} data-n={m.n} data-enough={m.enough ? "1" : "0"} data-drift={m.drift ? "1" : "0"}>
      <span className="hh-tv-label">{m.label}</span>
      <span className="hh-tv-theory">{m.theoryLabel}</span>
      <span className="hh-tv-actual">{m.enough ? m.actualLabel : "—"}</span>
      <p className="hh-tv-status">{m.status}</p>
    </div>
  );
}

/** JD4 — expected vs actual over the last 50 real hits for the selected tier. */
function TheoryBlock({ cmp }: { cmp: ReturnType<typeof buildTheoryCompare>[number] | undefined }) {
  if (!cmp) return null;
  const th = ALL_TIER_THEORY.find((t) => t.tierId === cmp.tierId);
  return (
    <div className="hh-tv" aria-label={`${cmp.name} theory vs actual`} data-tier={cmp.tierId}>
      <div className="hh-tv-head">
        <h3 className="hh-tv-title">Theory vs actual</h3>
        <span className="hh-tv-sub">last {THEORY_WINDOW} real hits</span>
      </div>
      <div className="hh-tv-cols" aria-hidden>
        <span />
        <span>Theory</span>
        <span>Actual</span>
      </div>
      <MetricRow m={cmp.hit} />
      <MetricRow m={cmp.coinIn} />
      {th && <p className="hh-tv-why">{theoryExplainer(th)}</p>}
      <p className="hh-tv-why">{THEORY_NOTE}</p>
    </div>
  );
}
