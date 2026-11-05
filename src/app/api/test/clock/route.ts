import { withUser, json } from "@/lib/http";
import { advanceTestClock, testClockEnabled, serverNow } from "@/lib/clock";

/** Local QA only. 404 everywhere the test clock is disabled (always on Vercel); test accounts only. */
export async function POST(req: Request) {
  if (!testClockEnabled()) return new Response("Not found", { status: 404 });
  return withUser(req, async (u) => {
    if (!u.email.endsWith("@pit.test")) return new Response("Not found", { status: 404 });
    const body = await req.json().catch(() => ({}));
    const offsetMs = advanceTestClock(Number(body.advanceMin) * 60_000);
    return json({ offsetMs, serverNow: serverNow().toISOString() });
  });
}
export const dynamic = "force-dynamic";
