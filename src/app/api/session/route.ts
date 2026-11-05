import { withDbSync } from "@/lib/dbSync";
import { withUser, json, err } from "@/lib/http";
import { getDb } from "@/lib/db";
import { currentSession, settingView, requestSetting, cancelSettingPending, sessionBlock, REALITY_CHOICES, SESSION_CHOICES, type SettingKind } from "@/lib/session";

function view(userId: string) {
  const db = getDb(); const now = new Date();
  return {
    session: currentSession(db, userId, now),
    reality: settingView(db, userId, "reality", now),
    sessionLimit: settingView(db, userId, "session", now),
    blocked: sessionBlock(db, userId, now),
    choices: { reality: REALITY_CHOICES, session: SESSION_CHOICES },
    serverNow: now.toISOString(),
  };
}
const num = (v: unknown) => (v === null || v === "" || v === undefined ? null : Number(v));

async function _GET(req: Request) { return withUser(req, async (u) => json(view(u.id))); }
async function _POST(req: Request) {
  return withUser(req, async (u) => {
    const body = await req.json(); const db = getDb();
    if (body.cancelPending !== undefined) {
      if (body.cancelPending !== "reality" && body.cancelPending !== "session") return err("cancelPending must be reality or session");
      cancelSettingPending(db, u.id, body.cancelPending as SettingKind);
      return json(view(u.id));
    }
    try {
      const result = db.transaction(() => ({
        reality: requestSetting(db, u.id, "reality", num(body.realityMin)),
        session: requestSetting(db, u.id, "session", num(body.sessionMin)),
      }))();
      return json({ result, ...view(u.id) });
    } catch (e) { return err(e instanceof Error ? e.message : "bad request"); }
  });
}
export const GET = withDbSync(_GET);
export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
