import { json } from "@/lib/http";
import { getPaymentsStatus } from "@/lib/payments";

/** Public-ish status for Cage UI: which payments adapter is active (never secrets). */
export async function GET() {
  return json(getPaymentsStatus());
}
