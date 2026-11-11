// Aggregates MC result lines into RTP with 95% CIs. Usage: node audit/aggregate.mjs <results.jsonl>
import fs from "fs";
const file = process.argv[2] ?? "audit/.out/results.jsonl";
const rows = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const groups = new Map();
for (const r of rows) { const k = `${r.game}|${r.arg ?? ""}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
const T = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365 };
const unitOf = { blackjack: 1000, holdem: 200, paigow: 1000 };
const out = [];
for (const [k, rs] of [...groups].sort()) {
  const [game, arg] = k.split("|");
  const S = (f) => rs.reduce((a, r) => a + (r[f] ?? 0), 0);
  const n = S("rounds"), W = S("wagered"), R = S("returned"), WW = S("WW"), RR = S("RR"), WR = S("WR");
  const rtp = R / W;
  const batch = game === "craps" || game === "canopyFull";
  let half;
  if (batch && rs.length > 1) {
    const per = rs.map((r) => r.returned / r.wagered); const m = per.reduce((a, b) => a + b, 0) / per.length;
    const sd = Math.sqrt(per.reduce((a, b) => a + (b - m) ** 2, 0) / (per.length - 1));
    half = T[per.length - 1] * sd / Math.sqrt(per.length);
  } else {
    const xbar = W / n; const ss = RR - 2 * rtp * WR + rtp * rtp * WW;
    half = 1.96 * Math.sqrt(ss / (n - 1) / n) / xbar;
  }
  const xbar = W / n;
  const unit = unitOf[game] ?? xbar;
  const sdNetPerUnit = Math.sqrt(((RR - 2 * WR + WW) / n - ((R - W) / n) ** 2)) / unit;
  out.push({ game, arg, seeds: rs.length, rounds: n, rtp, edge: 1 - rtp, ci95: half, ciMethod: batch ? `batch means over ${rs.length} seeds (t)` : "per-round ratio (delta method)",
    hitFreq: S("hits") / n || null, winFreq: S("wins") / n || null, sdNetPerUnit, unitCents: unit,
    netPerRoundUnits: (R - W) / n / unit, extra: Object.fromEntries(["line", "prog", "seedPaid", "hitsMini", "hitsMinor", "hitsMajor", "hitsGrand", "stuckHouseFoldAtDeal"].filter((f) => rs.some((r) => r[f] != null)).map((f) => [f, S(f)])) });
}
for (const o of out) console.log(`${o.game.padEnd(11)} ${String(o.arg).padEnd(10)} n=${o.rounds.toLocaleString().padStart(11)} RTP=${(100 * o.rtp).toFixed(3)}% ±${(100 * o.ci95).toFixed(3)} edge=${(100 * o.edge).toFixed(3)}% hit=${o.hitFreq == null ? "-" : (100 * o.hitFreq).toFixed(2) + "%"} win=${o.winFreq == null ? "-" : (100 * o.winFreq).toFixed(2) + "%"} sd/unit=${o.sdNetPerUnit.toFixed(3)} net/round=${o.netPerRoundUnits.toFixed(4)}u ${JSON.stringify(o.extra)}`);
fs.writeFileSync(file.replace(/\.jsonl$/, ".summary.json"), JSON.stringify(out, null, 1));
