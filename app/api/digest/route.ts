import { NextRequest, NextResponse } from "next/server";
import { generateDigest } from "@/lib/digest";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// AI business report: aggregate reasoning across every call.
export async function POST(req: NextRequest) {
  if (!env.hasAI()) {
    return NextResponse.json(
      { error: "AI provider is not configured on the server. Set ANTHROPIC_API_KEY or OPENAI_API_KEY." },
      { status: 503 }
    );
  }
  const businessId = req.nextUrl.searchParams.get("businessId") ?? undefined;
  try {
    const digest = await generateDigest(businessId);
    return NextResponse.json(digest);
  } catch (err: any) {
    console.error("digest error", err);
    return NextResponse.json(
      { error: err?.message || "Report generation failed — please try again." },
      { status: 500 }
    );
  }
}
