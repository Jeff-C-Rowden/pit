import { withDbSync } from "@/lib/dbSync";
import { withUser, json } from "@/lib/http";
import { getDb } from "@/lib/db";
import { serverNow } from "@/lib/clock";
import { sessionActivity, activityCsv } from "@/lib/session";

async function _GET(req: Request) {
  return withUser(req, async (u) => {
    const data = sessionActivity(getDb(), u.id, serverNow());
    if (new URL(req.url).searchParams.get("format") !== "csv") return json(data);
    const day = serverNow().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    return new Response(activityCsv(data.rows), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="pit-session-${day}.csv"`, "cache-control": "no-store" },
    });
  });
}
export const GET = withDbSync(_GET);
export const dynamic = "force-dynamic";
