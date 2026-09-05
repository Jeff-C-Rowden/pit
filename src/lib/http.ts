import { requireUserFromRequest, type PublicUser, toPublic } from "./auth";
import type { UserRow } from "./db";
import { LedgerError } from "./ledger";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function err(message: string, status = 400, extra?: Record<string, unknown>) {
  return json({ error: message, ...extra }, status);
}

export async function withUser(req: Request, fn: (user: UserRow) => Promise<Response>): Promise<Response> {
  try {
    const user = requireUserFromRequest(req);
    return await fn(user);
  } catch (e) {
    const status = (e as { status?: number }).status || 400;
    const msg = e instanceof LedgerError ? e.message : e instanceof Error ? e.message : "error";
    const code = e instanceof LedgerError ? e.code : undefined;
    if (msg === "unauthorized") return err("sign in to play", 401);
    return err(msg, status === 401 ? 401 : 400, code ? { code } : undefined);
  }
}

export function userPayload(user: UserRow): { user: PublicUser } {
  return { user: toPublic(user) };
}
