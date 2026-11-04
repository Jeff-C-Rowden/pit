import { withDbSync } from "@/lib/dbSync";
import { cookies } from "next/headers";
import { destroySession, SESSION_COOKIE } from "@/lib/auth";
import { json } from "@/lib/http";

async function _POST() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) destroySession(token);
  cookies().set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return json({ ok: true });
}

export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
