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
