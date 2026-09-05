import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const OPEN = new Set(["/", "/rules"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.startsWith("/api/auth/me")) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    if (pathname === "/api/auth/signup" || pathname === "/api/auth/login") {
      if (req.cookies.get("pit_age")?.value !== "21") {
        return NextResponse.json({ error: "21+ only" }, { status: 403 });
      }
    }
    return NextResponse.next();
  }
  const age = req.cookies.get("pit_age")?.value === "21";
  if (!age && !OPEN.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("gate", "1");
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
