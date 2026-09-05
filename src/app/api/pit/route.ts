import { withUser, json, err } from "@/lib/http";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  return withUser(req, async (user) => {
    if (!user.is_operator) return err("pit boss only", 403);
    const db = getDb();
    const users = db.prepare(
      `SELECT id, email, display_name, balance_cents, is_operator, created_at, deposit_limit_cents, loss_limit_cents FROM users ORDER BY created_at DESC LIMIT 200`
    ).all();
    const ledger = db.prepare(
      `SELECT l.*, u.email FROM ledger l JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 300`
    ).all();
    const openBets = db.prepare(
      `SELECT id, user_id, game, status, created_at, updated_at FROM game_states WHERE status = 'open' ORDER BY updated_at DESC LIMIT 200`
    ).all();
    const withdrawals = db.prepare(`SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT 100`).all();
    return json({ users, ledger, openBets, withdrawals });
  });
}
