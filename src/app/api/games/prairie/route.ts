import { withDbSync } from "@/lib/dbSync";
import { withUser, json, err } from "@/lib/http";
import { debitBet, creditPayout, getBalance } from "@/lib/ledger";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/rng";
import { PRAIRIE_INFO, playPrairie, publicPrairieSpin } from "@/lib/games/prairie";
import { PRAIRIE_MATH } from "@/lib/gameMath";
import { closeOpenFeatures, collectFeature, loadOpenFeature, openFeature, saveProgress } from "@/lib/featureResumeStore";

/**
 * GET publishes the math. GET ?resume=1 (signed in) returns the player's unfinished feature, if any:
 * the already-settled spin and how far it was watched, so a refresh picks the round up where it was.
 */
async function _GET(req: Request) {
  if (req instanceof Request && new URL(req.url).searchParams.get("resume")) {
    return withUser(req, async (user) => {
      const db = getDb();
      const feature = loadOpenFeature(user.id, db);
      const u = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
      return json({ feature, user: toPublic(u), sandbox: true });
    });
  }
  return json({ info: PRAIRIE_INFO, math: PRAIRIE_MATH, sandbox: true });
}

/**
 * One paid spin. The base grid, every coin value, every free spin and every Hold & Spin respin are
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
      if (body.action === "collect") return json({ ok: collectFeature(user.id, spinId, db) });
      const progress = saveProgress(user.id, spinId, body.progress, db);
      return progress ? json({ ok: true, progress }) : err("no unfinished feature for that spin", 404);
    }
    const spin = playPrairie(Number(body.coinCents));
    const key = String(body.idempotencyKey || newId());
    const db = getDb();
    const pub = publicPrairieSpin(spin);
    db.transaction(() => {
      debitBet(user.id, spin.betCents, "prairie", spin.id, `prairie-bet-${spin.id}-${key}`, { coinCents: spin.coinCents }, db);
      if (spin.winCents > 0) {
        creditPayout(user.id, spin.winCents, "prairie", spin.id, `prairie-pay-${spin.id}`, {
          baseWinCents: spin.baseWinCents,
          freeSpinsWinCents: spin.freeSpins?.totalWinCents ?? 0,
          freeSpins: spin.freeSpins?.spins.length ?? 0,
          holdWinCents: spin.hold?.totalWinCents ?? 0,
          holdCoins: spin.hold ? spin.hold.board.filter((v) => v !== null).length : 0,
        }, db);
      }
      if (spin.hold || spin.freeSpins) openFeature(user.id, pub, db);
      else closeOpenFeatures(user.id, db);
    })();
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({ user: toPublic(u), spin: pub, balanceCents: getBalance(user.id, db), sandbox: true });
  });
}

export const GET = withDbSync(_GET);
export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
