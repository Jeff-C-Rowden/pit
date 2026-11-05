import { withDbSync } from "@/lib/dbSync";
import { withUser, json, err } from "@/lib/http";
import { getDb } from "@/lib/db";
import { serverNow } from "@/lib/clock";
import { breakUntil, breakKind, selfExclude, EXCLUSION_CHOICES, takeBreak, currentSession, settingView, requestSetting, cancelSettingPending, sessionBlock, REALITY_CHOICES, SESSION_CHOICES, type SettingKind } from "@/lib/session";

function view(userId: string) {
  const db = getDb(); const now = serverNow();
  return {
    session: currentSession(db, userId, now),
    reality: settingView(db, userId, "reality", now),
    sessionLimit: settingView(db, userId, "session", now),
    blocked: sessionBlock(db, userId, now),
    breakUntil: breakUntil(db, userId, now),
    breakKind: breakKind(db, userId, now),
    choices: { reality: REALITY_CHOICES, session: SESSION_CHOICES, exclusion: Object.keys(EXCLUSION_CHOICES) },
    serverNow: now.toISOString(),
  };
}
const num = (v: unknown) => (v === null || v === "" || v === undefined ? null : Number(v));

async function _GET(req: Request) { return withUser(req, async (u) => json(view(u.id))); }
async function _POST(req: Request) {
  return withUser(req, async (u) => {
    const body = await req.json(); const db = getDb();
    if (body.takeBreak === true) {
      const until = takeBreak(db, u.id, serverNow());
      void until; return json(view(u.id));
    }
    if (body.selfExclude !== undefined) {
      // Only the listed lengths; starts now; never shortened; no end-early path exists.
      if (typeof body.selfExclude !== "string" || !Object.prototype.hasOwnProperty.call(EXCLUSION_CHOICES, body.selfExclude)) return err("selfExclude must be 24h, 7d or 30d");
      if (body.confirm !== true) return err("confirm the self-exclusion to start it");
      selfExclude(db, u.id, body.selfExclude, serverNow());
      return json(view(u.id));
    }
    if (body.cancelPending !== undefined) {
      if (body.cancelPending !== "reality" && body.cancelPending !== "session") return err("cancelPending must be reality or session");
      cancelSettingPending(db, u.id, body.cancelPending as SettingKind);
      return json(view(u.id));
    }
    try {
      const result = db.transaction(() => ({
        reality: requestSetting(db, u.id, "reality", num(body.realityMin), serverNow()),
        session: requestSetting(db, u.id, "session", num(body.sessionMin), serverNow()),
      }))();
      return json({ result, ...view(u.id) });
    } catch (e) { return err(e instanceof Error ? e.message : "bad request"); }
  });
}
export const GET = withDbSync(_GET);
export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
