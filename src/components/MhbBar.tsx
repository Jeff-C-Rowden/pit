import { mhbBar, type MhbMeterLike } from "@/lib/mhbBar";

/**
 * J1 must-hit-by ceiling bar: thin gold fill on dark lacquer from seed to the
 * real configured ceiling. Renders nothing for uncapped tiers (Grand).
 */
export default function MhbBar({ meter, shownCents }: { meter: MhbMeterLike; shownCents: number }) {
  const bar = mhbBar(meter, shownCents);
  if (!bar) return null;
  return (
    <span className="mhb" title={bar.ariaLabel}>
      <span
        className="mhb-track"
        role="progressbar"
        aria-label={bar.ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={bar.percent}
      >
        <span className="mhb-fill" style={{ width: `${bar.percent}%` }} />
      </span>
      <span className="mhb-copy">{bar.label}</span>
    </span>
  );
}
