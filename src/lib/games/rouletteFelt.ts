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


/** Canonical key for a set of felt numbers (order-independent). */
export function insideKey(numbers: readonly string[]): string {
  return [...numbers].map(String).sort((a, b) => {
    const rank = (x: string) => (x === "0" ? -2 : x === "00" ? -1 : Number(x));
    return rank(a) - rank(b);
  }).join("-");
}

function add(set: Set<string>, nums: (string | number)[]) {
  set.add(insideKey(nums.map(String)));
}

/** Every legal split, street, corner and six-line on an American layout, including 0/00 neighbors. */
export function legalInsideKeys(): Record<"split" | "street" | "corner" | "six", Set<string>> {
  const split = new Set<string>();
  const street = new Set<string>();
  const corner = new Set<string>();
  const six = new Set<string>();
  const rows = FELT_ROWS;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 12; c++) {
      const n = rows[r]![c]!;
      if (c < 11) add(split, [n, rows[r]![c + 1]!]); // along the number line (3-6, 1-4, …)
      if (r < 2) add(split, [n, rows[r + 1]![c]!]); // up/down a column (3-2, 2-1, …)
    }
  }
  // Zero splits offered on a standard American felt (0–00 is not a split here).
  add(split, ["0", "1"]);
  add(split, ["0", "2"]);
  add(split, ["00", "2"]);
  add(split, ["00", "3"]);

  for (let c = 0; c < 12; c++) {
    const streetNums = [rows[2]![c]!, rows[1]![c]!, rows[0]![c]!];
    add(street, streetNums);
    if (c < 11) {
      const next = [rows[2]![c + 1]!, rows[1]![c + 1]!, rows[0]![c + 1]!];
      add(six, [...streetNums, ...next]);
      add(corner, [rows[2]![c]!, rows[1]![c]!, rows[2]![c + 1]!, rows[1]![c + 1]!]);
      add(corner, [rows[1]![c]!, rows[0]![c]!, rows[1]![c + 1]!, rows[0]![c + 1]!]);
    }
  }
  // Zero streets (the two-number first-column baskets, not the five-number bet).
  add(street, ["0", "1", "2"]);
  add(street, ["00", "2", "3"]);

  return { split, street, corner, six };
}

const LEGAL_INSIDE = legalInsideKeys();

/** True when the numbers are a real adjacent inside bet on the American felt. */
export function isAdjacentInside(kind: "split" | "street" | "corner" | "six", numbers: readonly string[]): boolean {
  if (new Set(numbers).size !== numbers.length) return false;
  const expect = kind === "split" ? 2 : kind === "street" ? 3 : kind === "corner" ? 4 : 6;
  if (numbers.length !== expect) return false;
  return LEGAL_INSIDE[kind].has(insideKey(numbers));
}
