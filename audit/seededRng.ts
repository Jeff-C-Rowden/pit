/**
 * Deterministic stand-in for src/lib/rng.ts, used ONLY by the RTP audit harness.
 * Same exports, same semantics (uniform integers, Fisher-Yates), but seeded so every
 * Monte Carlo run is reproducible. Seed comes from process.env.AUDIT_SEED.
 */
let s0 = 0, s1 = 0, s2 = 0, s3 = 0;

function splitmix32(a: number) {
  return () => {
    a |= 0; a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16); t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15; t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

export function reseed(seed: number) {
  const sm = splitmix32(seed);
  s0 = sm(); s1 = sm(); s2 = sm(); s3 = sm();
}
reseed(Number(process.env.AUDIT_SEED ?? 1));

/** xoshiro128** -> uint32 */
function next32(): number {
  const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
  const t = s1 << 9;
  s2 ^= s0; s3 ^= s1; s1 ^= s2; s0 ^= s3; s2 ^= t; s3 = rotl(s3, 11);
  return result;
}
function rotl(x: number, k: number) { return (x << k) | (x >>> (32 - k)); }

/** Uniform in [0,1) with 53 bits. */
export function rand01(): number {
  return ((next32() >>> 5) * 67108864 + (next32() >>> 6)) / 9007199254740992;
}

export function randInt(maxExclusive: number): number {
  if (maxExclusive <= 0) throw new Error("maxExclusive must be > 0");
  return Math.floor(rand01() * maxExclusive);
}

export function randBytes(n: number): Buffer {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i++) b[i] = next32() & 255;
  return b;
}

export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function shuffle<T>(arr: readonly T[]): T[] {
  return shuffleInPlace(arr.slice());
}

let idc = 0;
export function newId(): string {
  idc += 1;
  return "a" + idc.toString(16);
}
