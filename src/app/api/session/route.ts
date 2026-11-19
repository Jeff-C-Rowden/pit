import { withDbSync } from "@/lib/dbSync";
import { withUser, json, err } from "@/lib/http";
import { getDb } from "@/lib/db";
import { serverNow } from "@/lib/clock";
import { weekSummary, breakUntil, breakKind, selfExclude, EXCLUSION_CHOICES, takeBreak, currentSession, settingView, requestSetting, cancelSettingPending, sessionBlock, budgetView, REALITY_CHOICES, SESSION_CHOICES, BUDGET_CHOICES, type SettingKind } from "@/lib/session";

function view(userId: string) {
  const db = getDb(); const now = serverNow();
  return {
    session: currentSession(db, userId, now),
    reality: settingView(db, userId, "reality", now),
    sessionLimit: settingView(db, userId, "session", now),
    budget: budgetView(db, userId, now),
    blocked: sessionBlock(db, userId, now),
    breakUntil: breakUntil(db, userId, now),
    breakKind: breakKind(db, userId, now),
    choices: { reality: REALITY_CHOICES, session: SESSION_CHOICES, budget: BUDGET_CHOICES, exclusion: Object.keys(EXCLUSION_CHOICES) },
    week: weekSummary(db, userId, now),
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
      if (body.cancelPending !== "reality" && body.cancelPending !== "session" && body.cancelPending !== "budget") return err("cancelPending must be reality, session or budget");
      cancelSettingPending(db, u.id, body.cancelPending as SettingKind);
      return json(view(u.id));
    }
    try {
      // Each setting changes only when its key is sent, so saving one never turns another off.
      const result = db.transaction(() => ({
        reality: "realityMin" in body ? requestSetting(db, u.id, "reality", num(body.realityMin), serverNow()) : { applied: "unchanged" as const, effectiveAt: null },
        session: "sessionMin" in body ? requestSetting(db, u.id, "session", num(body.sessionMin), serverNow()) : { applied: "unchanged" as const, effectiveAt: null },
        budget: "budgetCents" in body ? requestSetting(db, u.id, "budget", num(body.budgetCents), serverNow()) : { applied: "unchanged" as const, effectiveAt: null },
      }))();
      return json({ result, ...view(u.id) });
    } catch (e) { return err(e instanceof Error ? e.message : "bad request"); }
  });
}
export const GET = withDbSync(_GET);
export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
