"use client";
// Backlog #6: the shared cabinet win plate. Rendered by CabinetChrome only after every reel has
// stopped, for real wins that beat the bet (see src/lib/winCelebration.ts). Sits just above the reel
// window (over the info strip under the topper), so it never covers the reels, the S3 win walkthrough or its pill.
// Visual only: no sound (the result banner already owns the payout sound), no timers.
import { sparkLayout, type Celebration } from "@/lib/winCelebration";

export function WinCelebration({ celebration }: { celebration: Celebration | null | undefined }) {
  const plate = celebration?.plate;
  if (!celebration || !plate) return null;
  const sparks = sparkLayout(plate.sparks);
  return (
    <div
      key={celebration.key}
      className={`win-cele win-cele-${celebration.tier}${plate.motion ? " win-cele-motion" : ""}`}
      data-testid="win-celebration"
      data-tier={celebration.tier}
      role="status"
      aria-live="polite"
      aria-label={`${plate.title}: ${plate.amount}, ${plate.multiple}. Sandbox chips, no cash value.`}
    >
      {sparks.length > 0 && (
        <span className="win-cele-sparks" aria-hidden>
          {sparks.map((s, i) => (
            <i key={i} style={{ ["--a" as string]: `${s.angle}deg`, ["--d" as string]: `${s.dist}px`, ["--t" as string]: `${s.delay}ms` }} />
          ))}
        </span>
      )}
      <span className="win-cele-title" aria-hidden>{plate.title}</span>
      <span className="win-cele-amt" aria-hidden>{plate.amount}</span>
      <span className="win-cele-x" aria-hidden>{plate.multiple} · sandbox chips</span>
    </div>
  );
}
