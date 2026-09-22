"use client";

import { useEffect, useRef, useState } from "react";
import { money } from "@/components/useUser";

export type MeterPublic = {
  id: string;
  name: string;
  progressiveCents: number;
  seedCents: number;
  ceilingCents: number | null;
  contributionBps: number;
  hasMustHitBy?: boolean;
  lastHitAt?: string | null;
};

function Odometer({ cents, quiet }: { cents: number; quiet?: boolean }) {
  const prev = useRef<number | null>(null);
  const [display, setDisplay] = useState(cents);

  useEffect(() => {
    const from = prev.current;
    prev.current = cents;
    if (from == null || from === cents) {
      setDisplay(cents);
      return;
    }
    const t0 = performance.now();
    const dur = quiet ? 600 : cents < from ? 900 : 1100;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - (1 - p) * (1 - p);
      setDisplay(Math.round(from + (cents - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cents, quiet]);

  return <span className="prog-odo">{money(display)}</span>;
}

/**
 * Four-tier progressive strip (Mini / Minor / Major / Grand).
 * Extension point: leave room for future cabinet redesign; tap opens info.
 */
export default function ProgressiveMeterStrip({
  meters,
  quiet = false,
  hitTierIds = [],
  onOpenInfo,
  className = "",
}: {
  meters: MeterPublic[];
  /** Softer animation during active spins / peer drip */
  quiet?: boolean;
  hitTierIds?: string[];
  onOpenInfo?: (meter: MeterPublic) => void;
  className?: string;
}) {
  const order = ["Mini", "Minor", "Major", "Grand"];
  const sorted = [...meters].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));

  return (
    <div className={`prog-strip${className ? ` ${className}` : ""}`} role="group" aria-label="Progressive jackpot meters">
      {sorted.map((m) => {
        const hit = hitTierIds.includes(m.id);
        return (
          <button
            key={m.id}
            type="button"
            className={`prog-tier prog-tier-${m.name.toLowerCase()}${hit ? " prog-tier-hit" : ""}${quiet ? " prog-tier-quiet" : ""}`}
            onClick={() => onOpenInfo?.(m)}
            aria-label={`${m.name} progressive ${money(m.progressiveCents)}. Tap for info.`}
          >
            <span className="prog-tier-name">{m.name}</span>
            <span className="prog-tier-amount">
              <Odometer cents={m.progressiveCents} quiet={quiet && !hit} />
            </span>
            <span className="prog-tier-tag">{m.hasMustHitBy ? "Must-hit" : "Mystery"}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Single pot (legacy / nested) — kept as extension point. */
export function ProgressiveMeter({
  cents,
  label = "Grand",
  className = "",
  pulse = false,
}: {
  cents: number;
  label?: string;
  className?: string;
  pulse?: boolean;
}) {
  return (
    <div className={`prog-meter${pulse ? " prog-meter-pulse" : ""}${className ? ` ${className}` : ""}`} role="status">
      <div className="prog-meter-label">{label}</div>
      <div className="prog-meter-amount">
        <Odometer cents={cents} />
      </div>
    </div>
  );
}
