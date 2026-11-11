import { VS_REELS, VS_PAYLINES, VS_PAYTABLE } from "../src/lib/games/slotProgressive";
// Line-hit frequency per (symbol, count) over all 20^5 stop tuples, per line-credit.
const counts: Record<string, number[]> = {};
const n = 20; let combos = 0;
const W = VS_REELS.map((s) => s.map((_, st) => [0, 1, 2].map((r) => s[(st + r) % 20]!)));
for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let c = 0; c < n; c++) for (let d = 0; d < n; d++) for (let e = 0; e < n; e++) {
  const g = [W[0]![a]!, W[1]![b]!, W[2]![c]!, W[3]![d]!, W[4]![e]!]; combos++;
  for (const line of VS_PAYLINES) {
    const syms = line.map((row, reel) => g[reel]![row]!);
    const first = syms[0] === "WILD" ? (syms.find((s) => s !== "WILD") ?? "WILD") : syms[0]!;
    let k = 0; for (const s of syms) { if (s === first || s === "WILD") k++; else break; }
    if (k >= 3) { (counts[first] ??= [0, 0, 0])[k - 3]! += 1; }
  }
}
let rtp = 0;
for (const [s, c] of Object.entries(counts)) { const p = (VS_PAYTABLE as any)[s]; const r = c.map((x, i) => x * p[i] / (combos * 9)); rtp += r.reduce((a, b) => a + b, 0);
  console.log(s.padEnd(8), c.map((x) => (x / (combos * 9)).toExponential(4)).join("  "), "rtp", r.map((x) => (100 * x).toFixed(3)).join(" ")); }
console.log("total", rtp);
