import { createUser, loginUser, sessionCookieOptions } from "@/lib/auth";
import { cookies } from "next/headers";
import { err, json } from "@/lib/http";
import { toPublic } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const age = cookies().get("pit_age")?.value;
    if (age !== "21") return err("confirm you are 21 or older before creating an account", 403);
    const user = createUser({
      email: String(body.email || ""),
      password: String(body.password || ""),
      displayName: String(body.displayName || ""),
      ageConfirmed: true,
    });
    const { token } = loginUser(user.email, String(body.password));
    cookies().set(sessionCookieOptions(token));
    getDb();
    return json({ user: toPublic(user) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "signup failed";
    if (msg.includes("UNIQUE") || msg.toLowerCase().includes("unique")) return err("email already registered", 409);
    return err(msg);
  }
}
