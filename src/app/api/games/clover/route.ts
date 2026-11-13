import { withDbSync } from "@/lib/dbSync";
import { withUser, json, err } from "@/lib/http";
import { debitBet, creditPayout, getBalance } from "@/lib/ledger";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";
import { CLOVER_INFO, playClover, publicCloverSpin } from "@/lib/games/clover";
import { CLOVER_MATH } from "@/lib/gameMath";
import { featureStore } from "@/lib/featureResumeStore";
import { CLOVER_RESUME } from "@/lib/featureResumeSlots";

/** Research #5 slice 2: resumable features (no money in the saved copy). */
const cloverFeatures = featureStore(CLOVER_RESUME);

/**
 * GET publishes the math. GET ?resume=1 (signed in) returns the player's unfinished feature, if any:
 * the already-settled spin and how far it was watched, so a refresh picks the round up where it was.
 */
async function _GET(req: Request) {
  if (req instanceof Request && new URL(req.url).searchParams.get("resume")) {
    return withUser(req, async (user) => {
      const db = getDb();
      const feature = cloverFeatures.loadOpenFeature(user.id, db);
      const u = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
      return json({ feature, user: toPublic(u), sandbox: true });
    });
  }
  return json({ info: CLOVER_INFO, math: CLOVER_MATH, sandbox: true });
}

/**
 * One paid spin. The base grid, the Rainbow Wheel wedge(s) and every free spin are
 * decided here, before anything is shown, and the whole return is credited in the same transaction.
 * A spin with a feature also saves a resumable copy (no money in it) so a refresh doesn't lose the round.
 * Cash only (Bonus money stays on its own machines).
 *
 * { action: "progress", spinId, progress } saves how far the player has watched (forward only);
 * { action: "collect", spinId } closes the round. Neither touches the ledger.
 */
async function _POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    if (body?.action === "progress" || body?.action === "collect") {
      const spinId = String(body.spinId ?? "");
      const db = getDb();
      if (body.action === "collect") return json({ ok: cloverFeatures.collectFeature(user.id, spinId, db) });
      const progress = cloverFeatures.saveProgress(user.id, spinId, body.progress, db);
      return progress ? json({ ok: true, progress }) : err("no unfinished feature for that spin", 404);
    }
    const spin = playClover(Number(body.coinCents));
    const key = String(body.idempotencyKey || newId());
    const db = getDb();
    const pub = publicCloverSpin(spin);
    db.transaction(() => {
      debitBet(user.id, spin.betCents, "clover", spin.id, `clover-bet-${spin.id}-${key}`, { coinCents: spin.coinCents }, db);
      if (spin.winCents > 0) {
        creditPayout(user.id, spin.winCents, "clover", spin.id, `clover-pay-${spin.id}`, {
          baseWinCents: spin.baseWinCents,
          freeSpinsWinCents: spin.freeSpins?.totalWinCents ?? 0,
          freeSpins: spin.freeSpins?.spins.length ?? 0,
          wheelInner: spin.wheel?.inner ?? null,
          wheelOuter: spin.wheel?.outer ?? null,
          wheelWinCents: spin.wheel?.totalWinCents ?? 0,
        }, db);
      }
      if (spin.wheel || spin.freeSpins) cloverFeatures.openFeature(user.id, pub, db);
      else cloverFeatures.closeOpenFeatures(user.id, db);
    })();
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({ user: toPublic(u), spin: pub, balanceCents: getBalance(user.id, db), sandbox: true });
  });
}

export const GET = withDbSync(_GET);
export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
