import { cookies } from "next/headers";
import { destroySession, SESSION_COOKIE } from "@/lib/auth";
import { json } from "@/lib/http";

export async function POST() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) destroySession(token);
  cookies().set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return json({ ok: true });
}
