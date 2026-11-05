"use client";
/**
 * Polite screen-reader announcement of a settled result. Visually hidden; it only speaks when the
 * text changes, and always uses the exact final server amounts (never a count-up or animation frame).
 */
export default function LiveAnnounce({ text }: { text: string | null }) {
  return <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{text || ""}</div>;
}

export function resultPhrase(stakeCents: number, paidCents: number, money: (c: number) => string): string {
  const net = paidCents - stakeCents;
  if (stakeCents <= 0 && paidCents <= 0) return "";
  if (net > 0) return `You won ${money(net)}. Paid ${money(paidCents)} on ${money(stakeCents)} bet.`;
  if (net === 0) return `You broke even. ${money(paidCents)} back.`;
  return `You lost ${money(-net)}.${paidCents > 0 ? ` ${money(paidCents)} came back.` : ""}`;
}
