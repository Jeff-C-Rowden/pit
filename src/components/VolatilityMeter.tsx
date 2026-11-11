import { gameMath, VOL_TIP, type VolBucket } from "@/lib/gameMath";

const FILLED: Record<VolBucket, number> = { Low: 1, Medium: 2, High: 3 };

/** Original 3-bar volatility meter (maroon well, gold fill). Decorative; the text is the source. */
export function VolatilityMeter({ level, title }: { level: VolBucket; title?: string }) {
  const filled = FILLED[level];
  return (
    <span className="vol-meter" aria-hidden="true" title={title ?? `${level} volatility`}>
      {[1, 2, 3].map((n) => <span key={n} className={`vol-bar${n <= filled ? " on" : ""}`} />)}
    </span>
  );
}

/** Honest RTP / edge / volatility line for lobby tiles and in-game info panels. */
export function MathStrip({ game, variant = "panel" }: { game: string; variant?: "lobby" | "panel" | "hero" }) {
  const m = gameMath(game);
  const level = m.volatility === "by-bet" ? null : m.volatility;
  return (
    <p className={`math-strip math-strip-${variant}`} title={m.tip}>
      {level && <VolatilityMeter level={level} title={m.tip} />}
      <span>{m.line}</span>
    </p>
  );
}

export function volAria(game: string): string {
  return gameMath(game).line;
}

export { VOL_TIP };
