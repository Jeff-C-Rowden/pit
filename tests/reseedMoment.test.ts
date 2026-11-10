import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  RESEED_MOMENT_MS,
  activeMoment,
  displayCents,
  hitKey,
  mergeMoments,
  momentsFromNewHits,
  momentsFromSpinHits,
  nextExpiry,
  reseedLabel,
} from "@/lib/reseedMoment";

const METERS = [
  { id: "vault-mini", name: "Mini", seedCents: 1000 },
  { id: "vault-minor", name: "Minor", seedCents: 5000 },
  { id: "vault-major", name: "Major", seedCents: 25000 },
  { id: "vault-grand", name: "Grand", seedCents: 250000 },
];
const NOW = Date.parse("2026-11-10T18:00:00.000Z");

describe("J4 reseed moment: copy + display", () => {
  it("labels the real award and seed", () => {
    expect(reseedLabel({ wonCents: 2734, seedCents: 1000 })).toBe("Won $27.34 · reset to $10.00");
    expect(reseedLabel({ wonCents: 312345, seedCents: 250000 })).toBe("Won $3,123.45 · reset to $2,500.00");
  });
  it("holds the meter at seed only while the moment is live", () => {
    const [m] = momentsFromSpinHits([{ tierId: "vault-mini", name: "Mini", awardCents: 2734, reseedsTo: 1000 }], METERS, NOW);
    expect(m!.until).toBe(NOW + RESEED_MOMENT_MS);
    expect(RESEED_MOMENT_MS).toBe(5000);
    expect(displayCents(1012, activeMoment([m!], "vault-mini", NOW + 1000))).toBe(1000);
    expect(activeMoment([m!], "vault-mini", NOW + RESEED_MOMENT_MS)).toBeNull();
    expect(displayCents(1012, activeMoment([m!], "vault-mini", NOW + RESEED_MOMENT_MS))).toBe(1012);
    expect(activeMoment([m!], "vault-minor", NOW)).toBeNull();
  });
});

describe("J4 reseed moment: real events only", () => {
  it("own spin: only from server hits, falls back to meter seed, rejects junk", () => {
    expect(momentsFromSpinHits(null, METERS, NOW)).toEqual([]);
    expect(momentsFromSpinHits([], METERS, NOW)).toEqual([]);
    const ms = momentsFromSpinHits(
      [
        { tierId: "vault-minor", name: "Minor", awardCents: 9000 },
        { tierId: "vault-mini", name: "Mini", awardCents: 0, reseedsTo: 1000 },
        { tierId: "nope", name: "X", awardCents: 500 },
      ],
      METERS,
      NOW,
    );
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ tierId: "vault-minor", wonCents: 9000, seedCents: 5000 });
  });

  it("first poll records history without replaying it as live", () => {
    const hits = [{ tier: "Mini", tierId: "vault-mini", amountCents: 2000, at: new Date(NOW - 2000).toISOString() }];
    const r = momentsFromNewHits(null, hits, METERS, NOW);
    expect(r.moments).toEqual([]);
    expect(r.seen.has(hitKey(hits[0]!))).toBe(true);
    // Same list next poll: still nothing.
    expect(momentsFromNewHits(r.seen, hits, METERS, NOW + 4000).moments).toEqual([]);
  });

  it("a genuinely new hit since last poll becomes one moment per tier", () => {
    const seen = momentsFromNewHits(null, [], METERS, NOW).seen;
    const hits = [
      { tier: "Mini", tierId: "vault-mini", amountCents: 2600, at: new Date(NOW - 1000).toISOString() },
      { tier: "Mini", tierId: "vault-mini", amountCents: 2400, at: new Date(NOW - 3000).toISOString() },
      { tier: "Major", amountCents: 70000, at: new Date(NOW - 1500).toISOString() },
    ];
    const r = momentsFromNewHits(seen, hits, METERS, NOW);
    expect(r.moments.map((m) => [m.tierId, m.wonCents, m.seedCents])).toEqual([
      ["vault-mini", 2600, 1000],
      ["vault-major", 70000, 25000],
    ]);
  });

  it("stale or malformed hits never become moments", () => {
    const seen = new Set<string>();
    const r = momentsFromNewHits(
      seen,
      [
        { tier: "Mini", tierId: "vault-mini", amountCents: 2600, at: new Date(NOW - 10 * 60_000).toISOString() },
        { tier: "Minor", tierId: "vault-minor", amountCents: 2600, at: "garbage" },
        { tier: "Grand", tierId: "vault-grand", amountCents: -5, at: new Date(NOW).toISOString() },
        { tier: "Ghost", tierId: "vault-ghost", amountCents: 100, at: new Date(NOW).toISOString() },
      ],
      METERS,
      NOW,
    );
    expect(r.moments).toEqual([]);
    expect(momentsFromNewHits(seen, null, METERS, NOW).moments).toEqual([]);
  });

  it("merge replaces per tier, drops expired, and reports next expiry", () => {
    const a = momentsFromSpinHits([{ tierId: "vault-mini", name: "Mini", awardCents: 2000, reseedsTo: 1000 }], METERS, NOW);
    const b = momentsFromSpinHits([{ tierId: "vault-mini", name: "Mini", awardCents: 2100, reseedsTo: 1000 }], METERS, NOW + 2000);
    const merged = mergeMoments(a, b, NOW + 2000);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.wonCents).toBe(2100);
    expect(nextExpiry(merged, NOW + 2000)).toBe(RESEED_MOMENT_MS);
    expect(mergeMoments(merged, [], NOW + 2000 + RESEED_MOMENT_MS)).toEqual([]);
    expect(nextExpiry([], NOW)).toBeNull();
  });
});

describe("J4 reseed moment: wiring", () => {
  const strip = readFileSync("src/components/ProgressiveMeter.tsx", "utf8");
  const vault = readFileSync("src/app/vault/page.tsx", "utf8");
  const floor = readFileSync("src/app/floor/page.tsx", "utf8");
  const css = readFileSync("src/app/globals.css", "utf8");
  it("in-game strip and lobby render the moment and announce it politely", () => {
    expect(strip).toContain("prog-tier-reseed");
    expect(strip).toContain('aria-live="polite"');
    expect(floor).toContain("vault-lobby-reseed");
    expect(floor).toContain("momentsFromNewHits");
    expect(floor).toContain("Sandbox / test chips");
  });
  it("own hits: meters held until reels settle, moment starts after the jackpot card", () => {
    expect(vault).toContain("pendingMetersRef.current = d.meters");
    expect(vault).toContain("momentsFromSpinHits(jackpotModal");
  });
  it("no invented hit copy and reduced motion is respected", () => {
    for (const src of [strip, vault, floor]) expect(src).not.toMatch(/\b(due|hot|about to hit)\b/i);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.prog-tier-hit \{ animation: none; \}/);
  });
});
