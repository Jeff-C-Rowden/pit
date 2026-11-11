import { getUserByToken } from "../auth";
import type { UserRow } from "../db";

export function optionalUser(req: Request): UserRow | null {
  const m = (req.headers.get("cookie") || "").match(/(?:^|; )pit_session=([^;]+)/);
  return getUserByToken(m ? decodeURIComponent(m[1]!) : null);
}
