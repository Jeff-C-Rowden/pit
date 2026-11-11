/**
 * Thunderhoof Prairie audit.
 *   node audit/build.mjs audit/prairie.ts audit/.out/prairie.mjs
 *   node audit/.out/prairie.mjs exact            # closed form + two full 30^5 enumerations + feature DPs
 *   AUDIT_SEED=1 node audit/.out/prairie.mjs mc 1250000 25   # one MC job (seeded) through playPrairie
 */
import { prairieExactFull, playPrairie, waysRtpExact, PR_REELS, PR_FS_REELS, holdFinalLaw } from "../src/lib/games/prairie";

const [mode, nS, coinS] = process.argv.slice(2);
if (mode === "exact") {
  const t0 = Date.now();
  console.log(JSON.stringify({ full: prairieExactFull(), closedFormWays: { base: waysRtpExact(PR_REELS), free: waysRtpExact(PR_FS_REELS) }, holdFinalFrom6: holdFinalLaw(6), ms: Date.now() - t0 }, null, 1));
} else {
  const N = Number(nS), coin = Number(coinS ?? 25);
  let W = 0, R = 0, RR = 0, hits = 0, wins = 0, fs = 0, hs = 0, fsR = 0, hsR = 0, baseR = 0, fsSpins = 0, capped = 0, full = 0, both = 0, maxX = 0;
  const jack: Record<string, number> = { MINI: 0, MINOR: 0, MAJOR: 0 };
  for (let i = 0; i < N; i++) {
    const s = playPrairie(coin);
    const bet = s.betCents, ret = s.winCents;
    W += bet; R += ret; RR += (ret / bet) ** 2;
    if (ret > 0 || s.freeSpins || s.hold) hits++;
    if (ret > bet) wins++;
    baseR += s.baseWinCents;
    if (s.freeSpins) { fs++; fsR += s.freeSpins.totalWinCents; fsSpins += s.freeSpins.spins.length; if (s.freeSpins.capped) capped++; }
    if (s.hold) {
      hs++; hsR += s.hold.totalWinCents; if (s.hold.full) full++;
      for (const x of s.hold.board) { if (x === 10) jack.MINI!++; else if (x === 25) jack.MINOR!++; else if (x === 100) jack.MAJOR!++; }
    }
    if (s.hold && s.freeSpins) both++;
    maxX = Math.max(maxX, ret / bet);
  }
  console.log(JSON.stringify({ seed: Number(process.env.AUDIT_SEED ?? 1), N, coin, W, R, RR, hits, wins, fs, hs, fsR, hsR, baseR, fsSpins, capped, full, both, maxX, ...jack }));
}
