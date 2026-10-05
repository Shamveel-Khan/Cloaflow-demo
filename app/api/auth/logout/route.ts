import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, LEGACY_AUTH_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  res.cookies.set(LEGACY_AUTH_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return res;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  const res = NextResponse.redirect(url);
  res.cookies.set(AUTH_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  res.cookies.set(LEGACY_AUTH_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return res;
}
