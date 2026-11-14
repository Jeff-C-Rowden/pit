import { howItPlays } from "@/lib/howItPlays";
import { VolatilityMeter } from "./VolatilityMeter";
import { VOL_TIP } from "@/lib/gameMath";

/**
 * SS1: honest "how it plays" tags — RTP, volatility meter, win / any-pay frequency and the bonus trigger line,
 * all from the frozen paytable math. Used on every lobby card and inside each game's first-load card.
 */
export function HowItPlays({ game, variant = "lobby" }: { game: string; variant?: "lobby" | "first" }) {
  const h = howItPlays(game);
  return (
    <span className={`hip hip-${variant}`} data-hip={h.id} title={VOL_TIP}>
      {variant === "first" && <span className="hip-k">How it plays</span>}
      <span className="hip-tags" role="list">
        {h.tags.map((t) => (
          <span key={t.kind} role="listitem" className={`hip-tag hip-${t.kind}`} aria-label={t.long}>
            {t.kind === "vol" && h.volatility !== "by-bet" && <VolatilityMeter level={h.volatility} />}
            {t.label}
          </span>
        ))}
      </span>
      <span className="hip-trigger">{h.trigger}</span>
      {variant === "first" && <span className="hip-foot">Long-run figures from the paytable math, not a prediction of the next spin.</span>}
    </span>
  );
}
