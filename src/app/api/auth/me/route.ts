import { cookies } from "next/headers";
import { getUserByToken, SESSION_COOKIE, toPublic } from "@/lib/auth";
import { json } from "@/lib/http";
import { getDb } from "@/lib/db";

export async function GET() {
  getDb();
  const token = cookies().get(SESSION_COOKIE)?.value;
  const user = getUserByToken(token);
  if (!user) return json({ user: null }, 200);
  return json({ user: toPublic(user) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.age === 21 || body.age === "21") {
    const secure =
      process.env.NODE_ENV === "production" || process.env.PIT_COOKIE_SECURE === "1";
    cookies().set({
      name: "pit_age",
      value: "21",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure,
    });
    return json({ age: 21 });
  }
  return json({ error: "you must be 21 or older to enter Pit" }, 403);
}
