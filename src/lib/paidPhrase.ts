/** "won $5, $10 back": splits a payout into winnings and the player's own stake returned. Matches the ledger payout row. */
export function paidPhrase(paidCents: number, stakeBackCents: number | undefined, money: (c: number) => string): string {
  if (stakeBackCents == null) return `paid ${money(paidCents)}`;
  const back = Math.max(0, Math.min(stakeBackCents, paidCents));
  const won = paidCents - back;
  if (won > 0 && back > 0) return `won ${money(won)}, ${money(back)} back`;
  if (won > 0) return `won ${money(won)} (your bet stays on the table)`;
  return `${money(back)} back`;
}
