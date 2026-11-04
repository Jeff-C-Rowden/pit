/** American roulette felt + wheel. No RNG. */

export const RED_NUMS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36] as const;
export const BLACK_NUMS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35] as const;
export const RED = new Set<number>(RED_NUMS);
export const BLACK = new Set<number>(BLACK_NUMS);

/** Clockwise American wheel from 0. */
export const WHEEL_ORDER = [
  "0", "28", "9", "26", "30", "11", "7", "20", "32", "17", "5", "22", "34", "15", "3", "24", "36", "13", "1",
  "00", "27", "10", "25", "29", "12", "8", "19", "31", "18", "6", "21", "33", "16", "4", "23", "35", "14", "2",
] as const;

/** Felt rows, zeros on the left, 2:1 on the right. Top = 3rd column. */
export const FELT_ROWS: readonly (readonly number[])[] = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
];

export function pocketColor(p: string): "red" | "black" | "green" {
  if (p === "0" || p === "00") return "green";
  const n = Number(p);
  if (RED.has(n)) return "red";
  if (BLACK.has(n)) return "black";
  throw new Error(`unknown pocket ${p}`);
}

/** Pockets a felt bet covers (for highlights). Mirrors the server's bet definitions. */
export function coveredBy(b: { kind: string; numbers?: string[]; which?: number }): string[] {
  const r = (a: number, z: number) => Array.from({ length: z - a + 1 }, (_, i) => String(a + i));
  switch (b.kind) {
    case "red": return RED_NUMS.map(String);
    case "black": return BLACK_NUMS.map(String);
    case "even": return r(1, 36).filter((x) => Number(x) % 2 === 0);
    case "odd": return r(1, 36).filter((x) => Number(x) % 2 === 1);
    case "low": return r(1, 18);
    case "high": return r(19, 36);
    case "dozen": { const w = b.which ?? 1; return r((w - 1) * 12 + 1, w * 12); }
    case "column": { const w = b.which ?? 1; return r(1, 36).filter((x) => (Number(x) - w) % 3 === 0); }
    default: return b.numbers ?? [];
  }
}
