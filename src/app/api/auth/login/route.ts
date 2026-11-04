import { withDbSync } from "@/lib/dbSync";
import { cookies } from "next/headers";
import { loginUser, sessionCookieOptions, toPublic } from "@/lib/auth";
import { err, json } from "@/lib/http";

async function _POST(req: Request) {
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

export const POST = withDbSync(_POST);
export const dynamic = "force-dynamic";
