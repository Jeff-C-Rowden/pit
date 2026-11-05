/**
 * Server clock with a TEST-ONLY fast-forward.
 *
 * The offset can only ever be non-zero when PIT_TEST_CLOCK=1 is set AND the process is not
 * running on Vercel (no VERCEL env). Deployed builds never set either, so the offset is always 0
 * there and the /api/test/clock route answers 404. Used by local QA to screenshot the reality
 * check and time-limit states without waiting real minutes.
 */
let offsetMs = 0;
export function testClockEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PIT_TEST_CLOCK === "1" && !env.VERCEL && !env.VERCEL_ENV;
}
export function serverNow(): Date {
  return new Date(Date.now() + (testClockEnabled() ? offsetMs : 0));
}
export function advanceTestClock(ms: number): number {
  if (!testClockEnabled()) throw new Error("test clock disabled");
  if (!Number.isFinite(ms) || ms < 0 || ms > 24 * 3600_000) throw new Error("advance 0..24h");
  offsetMs += ms;
  return offsetMs;
}
export function resetTestClock() { offsetMs = 0; }
