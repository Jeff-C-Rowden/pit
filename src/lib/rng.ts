import { randomInt, randomBytes } from "crypto";

/** CSPRNG integer in [0, maxExclusive). */
export function randInt(maxExclusive: number): number {
  if (maxExclusive <= 0) throw new Error("maxExclusive must be > 0");
  return randomInt(0, maxExclusive);
}

export function randBytes(n: number): Buffer {
  return randomBytes(n);
}

export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function shuffle<T>(arr: readonly T[]): T[] {
  return shuffleInPlace(arr.slice());
}

export function newId(): string {
  return randomBytes(16).toString("hex");
}
