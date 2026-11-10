"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Chip, CustomWagerInput } from "./TableUX";
import { LAST_BET_KEY, parseLastBets, recordLastBet, repeatBetState, SLOT_COIN_MAX, SLOT_COIN_MIN, SLOT_LINES } from "@/lib/quickBet";

/** Last server-accepted coin for a table (device-only, localStorage). */
export function useLastBet(game: string) {
  const [last, setLast] = useState<number | null>(null);
  useEffect(() => {
    try { setLast(parseLastBets(localStorage.getItem(LAST_BET_KEY))[game] ?? null); } catch { /* ignore */ }
  }, [game]);
  const remember = useCallback((coinCents: number) => {
    try { localStorage.setItem(LAST_BET_KEY, recordLastBet(localStorage.getItem(LAST_BET_KEY), game, coinCents)); } catch { /* ignore */ }
    setLast(coinCents);
  }, [game]);
  return [last, remember] as const;
}

/**
 * Thumb-first bet row for slot docks: one line of coin chips, then Custom $ +
 * Repeat (+ optional extras like Max Bet). Repeat re-selects the last accepted
 * coin and spins it; the server still checks balance and limits.
 */
export default function QuickBetRow({
  amounts,
  selected,
  onSelect,
  lastCoinCents,
  balanceCents,
  busy,
  onRepeat,
  lines = SLOT_LINES,
  minCents = SLOT_COIN_MIN,
  maxCents = SLOT_COIN_MAX,
  children,
}: {
  amounts: readonly number[];
  selected: number;
  onSelect: (cents: number) => void;
  lastCoinCents: number | null;
  balanceCents: number;
  busy: boolean;
  onRepeat: (coinCents: number) => void;
  lines?: number;
  minCents?: number;
  maxCents?: number;
  children?: ReactNode;
}) {
  const rep = repeatBetState({ lastCoinCents, currentCoinCents: selected, balanceCents, lines, busy, min: minCents, max: maxCents });
  return (
    <div className="quick-bet">
      <div className="chip-row quick-chips" role="group" aria-label="Coin size per line (sandbox chips)">
        {amounts.map((c) => (
          <Chip key={c} cents={c} selected={selected === c} onClick={() => onSelect(c)} label={`Coin ${(c / 100).toFixed(2)} dollars per line`} />
        ))}
      </div>
      <div className="quick-bet-sub">
        <CustomWagerInput selected={selected} onSelect={onSelect} minCents={minCents} maxCents={maxCents} />
        {rep.show && (
          <button
            type="button"
            className="btn repeat-bet"
            disabled={!rep.enabled}
            onClick={() => rep.enabled && onRepeat(rep.coinCents)}
            aria-label={`Repeat last bet: ${rep.label.replace("Repeat ", "")} total, coin ${(rep.coinCents / 100).toFixed(2)} dollars × ${lines} lines${rep.reason ? ` — ${rep.reason}` : ""}`}
            title={rep.reason ?? undefined}
          >
            <span aria-hidden className="repeat-ico">↻</span> {rep.label}
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
