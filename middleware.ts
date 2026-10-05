import { NextRequest, NextResponse } from "next/server";
import { isValidSession, AUTH_COOKIE_NAME, LEGACY_AUTH_COOKIE_NAME } from "@/lib/auth";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/api/dashboard",
  "/api/tasks",
  "/api/waitlist",
  "/api/appointments",
  "/api/orders",
  "/api/digest",
  "/api/calls",
  "/api/faq-suggestions",
  "/api/businesses",
];

export function middleware(req: NextRequest) {
  const token = process.env.DASHBOARD_TOKEN;
  const { pathname } = req.nextUrl;

  if (!PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check auth cookies
  const sessionCookie =
    req.cookies.get(AUTH_COOKIE_NAME)?.value ||
    req.cookies.get(LEGACY_AUTH_COOKIE_NAME)?.value;

  if (sessionCookie && isValidSession(sessionCookie)) {
    return NextResponse.next();
  }

  // Token supplied in URL parameter (?token=...) or custom header
  const supplied =
    req.nextUrl.searchParams.get("token") ??
    req.headers.get("x-cloaflow-token") ??
    req.headers.get("x-aiva-token");

  if (supplied && (isValidSession(supplied) || (token && supplied === token))) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("token");
    const res = NextResponse.redirect(url);
    const cookieOpts = {
      httpOnly: true,
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    };
    res.cookies.set(AUTH_COOKIE_NAME, supplied, cookieOpts);
    res.cookies.set(LEGACY_AUTH_COOKIE_NAME, supplied, cookieOpts);
    return res;
  }

  // If DASHBOARD_TOKEN is not configured, we allow open access in local dev
  if (!token) {
    return NextResponse.next();
  }

  // Protected and unauthorized: redirect browser to /login, return 401 for API
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
