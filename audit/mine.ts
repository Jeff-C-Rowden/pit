/**
 * Canary Creek Mine audit.
 *   node audit/build.mjs audit/mine.ts audit/.out/mine.mjs
 *   node audit/.out/mine.mjs exact            # closed form + full 30^5 base enumeration
 *   AUDIT_SEED=1 node audit/.out/mine.mjs mc 1250000 25   # one MC job (seeded) through playMine
 */
import { mineExactFull, mineEnumerate, playMine } from "../src/lib/games/mine";

const [mode, nS, coinS] = process.argv.slice(2);
if (mode === "exact") {
  const t0 = Date.now();
  const en = mineEnumerate(); const { byScatter, ...rest } = en; console.log(JSON.stringify({ full: mineExactFull(en), enumeration: rest, byScatter, ms: Date.now() - t0 }, null, 1));
} else {
  const N = Number(nS), coin = Number(coinS ?? 25);
  let W = 0, R = 0, RR = 0, hits = 0, wins = 0, fs = 0, pk = 0, fsR = 0, pkR = 0, baseR = 0, fsSpins = 0, capped = 0, maxX = 0;
  for (let i = 0; i < N; i++) {
    const s = playMine(coin);
    const bet = s.betCents, ret = s.winCents;
    W += bet; R += ret; RR += (ret / bet) ** 2;
    if (ret > 0 || s.freeSpins || s.pick) hits++;
    if (ret > bet) wins++;
    baseR += s.baseWinCents;
    if (s.freeSpins) { fs++; fsR += s.freeSpins.totalWinCents; fsSpins += s.freeSpins.spins.length; if (s.freeSpins.capped) capped++; }
    if (s.pick) { pk++; pkR += s.pick.totalWinCents; }
    maxX = Math.max(maxX, ret / bet);
  }
  console.log(JSON.stringify({ seed: Number(process.env.AUDIT_SEED ?? 1), N, coin, W, R, RR, hits, wins, fs, pk, fsR, pkR, baseR, fsSpins, capped, maxX }));
}
