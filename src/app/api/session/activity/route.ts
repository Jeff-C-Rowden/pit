import { withDbSync } from "@/lib/dbSync";
import { withUser, json } from "@/lib/http";
import { getDb } from "@/lib/db";
import { serverNow } from "@/lib/clock";
import { sessionActivity, activityCsv, historyRange, historyActivity } from "@/lib/session";

async function _GET(req: Request) {
  return withUser(req, async (u) => {
    const sp = new URL(req.url).searchParams;
    if (sp.get("scope") === "all") {
      const r = historyRange(sp.get("from"), sp.get("to"));
      if ("error" in r) return json({ error: r.error }, 400);
      return new Response(activityCsv(historyActivity(getDb(), u.id, r.start, r.end)), {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="pit-history-${sp.get("from")}-to-${sp.get("to")}.csv"`, "cache-control": "no-store" },
      });
    }
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
