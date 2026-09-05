import { withUser, json, err } from "@/lib/http";
import { getDb } from "@/lib/db";
import { toPublic } from "@/lib/auth";

export async function POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await req.json();
    let deposit = body.depositLimitCents;
    let loss = body.lossLimitCents;
    if (deposit === "" || deposit === null) deposit = null;
    if (loss === "" || loss === null) loss = null;
    if (deposit != null && (!Number.isInteger(deposit) || deposit < 1000)) return err("deposit limit must be integer cents >= $10");
    if (loss != null && (!Number.isInteger(loss) || loss < 1000)) return err("loss limit must be integer cents >= $10");
    getDb().prepare("UPDATE users SET deposit_limit_cents = ?, loss_limit_cents = ? WHERE id = ?").run(deposit, loss, user.id);
    const fresh = getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
    return json({ user: toPublic(fresh) });
  });
}
