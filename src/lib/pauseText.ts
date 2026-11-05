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

/** Short button label while new bets are refused, e.g. "Paused until 12:58 AM", or null. */
export function pausedLabel(d: PauseInfo | null | undefined): string | null {
  if (!d) return null;
  const at = d.breakUntil || d.blocked?.breakEndsAt;
  if (!at) return null;
  const t = new Date(at);
  const soon = t.getTime() - Date.now() < 20 * 3_600_000;
  const label = soon
    ? t.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" })
    : t.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" }) + ", " + t.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" });
  return `Paused until ${label}`;
}

/** Gentle Floor line while self-excluded, with the server's end time, or null. */
export function exclusionNote(d: PauseInfo | null | undefined): string | null {
  if (!d?.breakUntil || d.breakKind !== "exclusion") return null;
  return `Your self-exclusion ends at ${chicagoTime(d.breakUntil)}.`;
}
