// Aggregates audit/.out/mine-mc.jsonl: RTP with 95% CI, SD per unit, hit / win / feature rates.
import fs from "fs";
const rows = fs.readFileSync(process.argv[2] ?? "audit/.out/mine-mc.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
const t = rows.reduce((a, r) => { for (const k of Object.keys(r)) if (typeof r[k] === "number") a[k] = (a[k] ?? 0) + r[k]; return a; }, {});
const N = t.N, mean = t.R / t.W, ex2 = t.RR / N, sd = Math.sqrt(ex2 - mean * mean);
const out = {
  seeds: rows.map((r) => r.seed), rounds: N, rtp: mean, ci95: 1.96 * sd / Math.sqrt(N), sdPerUnit: sd,
  base: t.baseR / t.W, freeSpins: t.fsR / t.W, pick: t.pkR / t.W,
  hitRate: t.hits / N, winRate: t.wins / N, fsOneIn: N / t.fs, pickOneIn: N / t.pk, fsSpinsPerFeature: t.fsSpins / t.fs,
  capped: t.capped, maxX: Math.max(...rows.map((r) => r.maxX)),
};
console.log(JSON.stringify(out, null, 1));
