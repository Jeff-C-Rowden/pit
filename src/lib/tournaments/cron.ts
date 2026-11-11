import type Database from "better-sqlite3";
import { chicagoYmd } from "./schedule";

export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  return !!secret && header === `Bearer ${secret}`;
}

/** Drop per-round audit rows 7 days after a tournament finished (entries and results stay). */
export function pruneRounds(db: Database.Database, now: Date): number {
  const cutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const ids = db.prepare(`SELECT r.id FROM tournament_rounds r JOIN tournament_entries e ON e.id = r.entry_id JOIN tournaments t ON t.id = e.tournament_id
    WHERE t.status = 'finished' AND t.finalized_at < ? LIMIT 5000`).all(cutoff) as { id: string }[];
  if (!ids.length) return 0;
  const del = db.prepare("DELETE FROM tournament_rounds WHERE id = ?");
  db.transaction(() => { for (const r of ids) del.run(r.id); })();
  return ids.length;
}

/** Fee earned vs freeroll seed spent for a Chicago day (house margin = fees − seed). */
export function houseBookSummary(db: Database.Database, now: Date, day = chicagoYmd(now)) {
  const rows = db.prepare("SELECT kind, COALESCE(SUM(amount_cents), 0) AS c FROM tournament_house_book WHERE chicago_day = ? GROUP BY kind").all(day) as { kind: string; c: number }[];
  const get = (k: string) => rows.find((r) => r.kind === k)?.c ?? 0;
  const fees = get("fee") + get("fee_refund");
  const seed = get("freeroll_seed");
  return { day, feesCents: fees, freerollSeedCents: seed, netCents: fees - seed };
}
