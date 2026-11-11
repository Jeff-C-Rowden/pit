/**
 * Kettle of Clover audit.
 *   node audit/build.mjs audit/clover.ts audit/.out/clover.mjs
 *   node audit/.out/clover.mjs exact            # closed form + two full 30^5 enumerations + feature DPs
 *   AUDIT_SEED=1 node audit/.out/clover.mjs mc 1250000 25   # one MC job (seeded) through playClover
 */
import { cloverExactFull, playClover, lineRtpExact } from "../src/lib/games/clover";

const [mode, nS, coinS] = process.argv.slice(2);
if (mode === "exact") {
  const t0 = Date.now();
  console.log(JSON.stringify({ full: cloverExactFull(), closedFormLines: { base: lineRtpExact(false), free: lineRtpExact(true) }, ms: Date.now() - t0 }, null, 1));
} else {
  const N = Number(nS), coin = Number(coinS ?? 25);
  let W = 0, R = 0, RR = 0, hits = 0, wins = 0, fs = 0, wh = 0, fsR = 0, whR = 0, baseR = 0, fsSpins = 0, capped = 0, upg = 0, whFs = 0, both = 0, maxX = 0;
  for (let i = 0; i < N; i++) {
    const s = playClover(coin);
    const bet = s.betCents, ret = s.winCents;
    W += bet; R += ret; RR += (ret / bet) ** 2;
    if (ret > 0 || s.freeSpins || s.wheel) hits++;
    if (ret > bet) wins++;
    baseR += s.baseWinCents;
    if (s.freeSpins) { fs++; fsR += s.freeSpins.totalWinCents; fsSpins += s.freeSpins.spins.length; if (s.freeSpins.capped) capped++; }
    if (s.wheel) { wh++; whR += s.wheel.totalWinCents; if (s.wheel.outer !== null) upg++; if (s.wheel.freeSpins) whFs++; }
    if (s.wheel && s.freeSpins) both++;
    maxX = Math.max(maxX, ret / bet);
  }
  console.log(JSON.stringify({ seed: Number(process.env.AUDIT_SEED ?? 1), N, coin, W, R, RR, hits, wins, fs, wh, fsR, whR, baseR, fsSpins, capped, upg, whFs, both, maxX }));
}
