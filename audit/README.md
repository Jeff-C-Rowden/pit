# RTP audit harness

Reproduces every number in `../RTP_AUDIT.md`. Needs Node 22 and `node_modules` (symlink from the main checkout works).

    node audit/build.mjs audit/exact.ts audit/.out/exact.mjs && node audit/.out/exact.mjs   # exact math (~5 s)
    node audit/build.mjs audit/mc.ts audit/.out/mc.mjs
    ./audit/jobs.sh | xargs -P 6 -L 1 bash -c 'AUDIT_SEED=$0 node audit/.out/mc.mjs "$1" "$2" "$3" >> audit/.out/results.jsonl'
    node audit/aggregate.mjs audit/.out/results.jsonl                                       # RTP, 95% CI, hit rate, SD

- `build.mjs` bundles an entry with esbuild and swaps `src/lib/rng.ts` for `seededRng.ts`
  (xoshiro128**, seed from `AUDIT_SEED`), so Monte Carlo runs go through the real server game
  functions but are reproducible. Nothing in `src/` changes.
- `snapshots/games/buckshot.ts` is a read-only copy (sha256 99c7b0a0…) of the uncommitted
  Buckshot Bars WIP from the main checkout at 23:17 CST; it is not on origin yet.
- `src/lib/games/rtpMath.ts` (in the app) holds the exact slot / progressive math that the
  tests in `tests/rtpAudit.test.ts` lock to ±0.3 points.
