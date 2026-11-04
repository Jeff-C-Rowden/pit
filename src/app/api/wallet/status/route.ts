import { withDbSync } from "@/lib/dbSync";
import { json } from "@/lib/http";
import { getPaymentsStatus } from "@/lib/payments";

/** Public-ish status for Cage UI: which payments adapter is active (never secrets). */
async function _GET() {
  return json(getPaymentsStatus());
}

export const GET = withDbSync(_GET);
export const dynamic = "force-dynamic";
