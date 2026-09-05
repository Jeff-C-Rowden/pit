import { cookies } from "next/headers";
import { loginUser, sessionCookieOptions, toPublic } from "@/lib/auth";
import { err, json } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const age = cookies().get("pit_age")?.value;
    if (age !== "21") return err("confirm you are 21 or older first", 403);
    const body = await req.json();
    const { user, token } = loginUser(String(body.email || ""), String(body.password || ""));
    cookies().set(sessionCookieOptions(token));
    return json({ user: toPublic(user) });
  } catch (e) {
    return err(e instanceof Error ? e.message : "login failed", 401);
  }
}
