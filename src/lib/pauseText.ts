import { chicagoTime } from "./limitText";

export type PauseInfo = { breakUntil?: string | null; breakKind?: "break" | "exclusion" | null; blocked?: { breakEndsAt: string } | null };
/** Calm one-line status when the server is refusing new bets, or null. The end time is the server's own. */
export function pauseText(d: PauseInfo | null | undefined): string | null {
  if (!d) return null;
  if (d.breakUntil) return d.breakKind === "exclusion"
    ? `Bets are paused: you excluded yourself until ${chicagoTime(d.breakUntil)}.`
    : `Bets are paused: you're on a break until ${chicagoTime(d.breakUntil)}.`;
  if (d.blocked) return `Bets are paused: session time is up. New bets open at ${chicagoTime(d.blocked.breakEndsAt)}.`;
  return null;
}
