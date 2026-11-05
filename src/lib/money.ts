/** All money is integer cents. Never use floats for balances. */

export function dollarsToCents(d: number): number {
  if (!Number.isFinite(d)) throw new Error("invalid dollars");
  return Math.round(d * 100);
}

export function centsToLabel(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const d = Math.floor(abs / 100);
  const c = abs % 100;
  return `${sign}$${d}.${c.toString().padStart(2, "0")}`;
}

export function assertPositiveCents(cents: number): void {
  if (!Number.isInteger(cents) || cents <= 0) {
    throw new Error("amount must be a positive integer (cents)");
  }
}

export function assertNonNegativeCents(cents: number): void {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error("amount must be a non-negative integer (cents)");
  }
}

/**
 * Parse a dollar amount typed by a person ("25", "25.5", "$1,000.00") into integer cents.
 * Returns null for blank or invalid input (negative, more than 2 decimals, not a number).
 * The server still validates the resulting cents; this only converts the UI's input.
 */
export function parseDollarsInput(raw: string): number | null {
  const s = String(raw ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$|^\.\d{1,2}$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}
