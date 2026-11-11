"use client";
import { money } from "./useUser";

type Funding = { funded: { cashCents: number; bonusCents: number }; paid: { cashCents: number; bonusCents: number; convertedCents: number } | null };

/** Cash and Bonus under a slot, plus an honest line on how the last spin was funded and paid. */
export function WalletSplit({ cash, bonus, funding, bonusToCash }: { cash: number; bonus: number; funding: Funding | null; bonusToCash: boolean }) {
  const f = funding?.funded;
  const p = funding?.paid;
  return (
    <div className="wallet-split" aria-live="polite">
      <span className="wallet-split-item"><span className="wallet-split-lab">Cash</span> <b data-testid="split-cash">{money(cash)}</b></span>
      <span className="wallet-split-item wallet-split-bonus"><span className="wallet-split-lab">Bonus</span> <b data-testid="split-bonus">{money(bonus)}</b></span>
      <span className="wallet-split-note muted">{bonusToCash ? "Bets use Bonus first here; bonus-funded winnings pay in cash." : "Bets use Cash first, then Bonus. Bonus winnings stay Bonus."}</span>
      {f && (
        <span className="wallet-split-last" data-testid="split-last">
          Last spin: {f.cashCents > 0 && <>{money(f.cashCents)} cash</>}{f.cashCents > 0 && f.bonusCents > 0 && " + "}{f.bonusCents > 0 && <>{money(f.bonusCents)} bonus</>} bet
          {p ? <> · paid {p.cashCents > 0 && <>{money(p.cashCents)} cash</>}{p.cashCents > 0 && p.bonusCents > 0 && " + "}{p.bonusCents > 0 && <>{money(p.bonusCents)} bonus</>}{p.convertedCents > 0 && <> ({money(p.convertedCents)} of it from bonus play, paid as cash)</>}</> : " · no win"}
        </span>
      )}
    </div>
  );
}
