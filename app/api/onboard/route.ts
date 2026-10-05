import { NextRequest, NextResponse } from "next/server";
import { addBusiness } from "@/lib/db";
import { generateBusiness } from "@/lib/onboard";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// AI self-onboarding: description in, ready-to-call AI receptionist out.
export async function POST(req: NextRequest) {
  // Onboarding generation is expensive — 5 per 10 minutes per IP.
  const rl = rateLimit(clientKey(req, "onboard"), 5, 600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many generations — try again in ${rl.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }
  if (!env.hasAI()) {
    return NextResponse.json(
      { error: "AI provider is not configured on the server. Set ANTHROPIC_API_KEY or OPENAI_API_KEY." },
      { status: 503 }
    );
  }

  const { description } = (await req.json()) as { description: string };
  if (!description || description.trim().length < 20) {
    return NextResponse.json(
      { error: "Please describe your business in a few sentences." },
      { status: 400 }
    );
  }

  try {
    const business = await generateBusiness(description.trim());
    await addBusiness(business);
    return NextResponse.json(business);
  } catch (err: any) {
    console.error("onboard error", err);
    return NextResponse.json(
      { error: err?.message || "Generation failed — please try again." },
      { status: 500 }
    );
  }
}
