import { withDbSync } from "@/lib/dbSync";
import { json } from "@/lib/http";
import { getFairness } from "@/lib/progressive";
import { FAIRNESS_FORMAT } from "@/lib/potFairness";

/**
 * JD2 provably fair hidden trigger. Public, read-only: each open cycle's SHA-256
 * commitment (never its trigger or salt) and the last few ended cycles with their
 * trigger + salt revealed for verification.
 */
async function _GET() {
  return json({ format: FAIRNESS_FORMAT, tiers: getFairness(), sandbox: true });
}

export const GET = withDbSync(_GET);
export const dynamic = "force-dynamic";
