import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("ledger store reads are never fetch-cached", () => {
  it("neon client opts out of the Next.js fetch cache", () => {
    // GET-only route handlers (e.g. /api/wallet/ledger) otherwise replay a cached snapshot query.
    const src = fs.readFileSync("src/lib/dbSync.ts", "utf8");
    expect(src).toMatch(/neon\(pgUrl\(\)!, \{ fetchOptions: \{ cache: "no-store" \} \}\)/);
  });
});
