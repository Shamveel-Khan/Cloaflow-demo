import { NextRequest, NextResponse } from "next/server";
import {
  verifyCredentials,
  createSessionToken,
  AUTH_COOKIE_NAME,
  LEGACY_AUTH_COOKIE_NAME,
  DEMO_USER,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!verifyCredentials(email, password)) {
      return NextResponse.json(
        { error: "Invalid email or password. Use demo@cloaflow.local / demo123" },
        { status: 401 }
      );
    }

    const token = createSessionToken(email || DEMO_USER.email);
    const res = NextResponse.json({
      ok: true,
      user: {
        email: email || DEMO_USER.email,
        name: DEMO_USER.name,
      },
    });

    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    };

    res.cookies.set(AUTH_COOKIE_NAME, token, cookieOptions);
    res.cookies.set(LEGACY_AUTH_COOKIE_NAME, token, cookieOptions);

    return res;
  } catch (err) {
    console.error("Login error", err);
    return NextResponse.json(
      { error: "Internal server error during login" },
      { status: 500 }
    );
  }
}
