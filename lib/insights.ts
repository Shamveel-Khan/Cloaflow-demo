// Post-call intelligence: after a call ends, Cloaflow produces a summary,
// sentiment, action items and upsell opportunities — structured output so
// the result is always parseable.
import { addActionItem, newId, upsertCall } from "./db";
import { emitWebhook } from "./webhooks";
import { getAIProvider } from "./ai/provider";
import { env } from "./env";
import type { Business, CallLog } from "./types";

const INSIGHT_SCHEMA = {
  type: "object" as const,
  properties: {
    summary: {
      type: "string",
      description: "1-2 sentence summary of the call",
    },
    sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
    intent: {
      type: "string",
      enum: ["booking", "order", "question", "complaint", "reschedule", "other"],
      description: "The caller's primary intent",
    },
    resolved: {
      type: "boolean",
      description:
        "true only if the caller's need was fully handled on this call without requiring staff follow-up",
    },
    language: {
      type: "string",
      description: "Primary language of the caller, ISO 639-1 code",
    },
    action_items: {
      type: "array",
      items: { type: "string" },
      description:
        "Concrete follow-ups for staff. Empty if fully resolved by Cloaflow.",
    },
    upsell_opportunity: {
      type: "string",
      description:
        "A service/product this caller would plausibly buy next, phrased as advice to the owner. Empty string if none.",
    },
  },
  required: [
    "summary",
    "sentiment",
    "intent",
    "resolved",
    "language",
    "action_items",
    "upsell_opportunity",
  ],
  additionalProperties: false,
};

interface ParsedInsight {
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  intent: NonNullable<CallLog["intent"]>;
  resolved: boolean;
  language: string;
  action_items: string[];
  upsell_opportunity: string;
}

export async function analyzeCall(
  business: Business,
  call: CallLog,
  opts?: { provider?: string }
): Promise<CallLog> {
  // Idempotent: the end-call endpoint and the Twilio status callback can
  // both fire for the same call — analyze once.
  if (!env.hasAI() || call.transcript.length === 0 || call.summary)
    return call;

  const transcript = call.transcript
    .map((t) => `${t.role === "aiva" ? "Cloaflow" : "Caller"}: ${t.text}`)
    .join("\n");

  try {
    const provider = getAIProvider(opts?.provider);
    const parsed = await provider.generateStructured<ParsedInsight>({
      schemaName: "call_insights",
      schema: INSIGHT_SCHEMA,
      userPrompt: `Analyze this phone call handled by an AI receptionist for ${business.name} (a ${business.type}).\n\n${transcript}`,
      maxTokens: 1024,
    });

    call.summary = parsed.summary;
    call.sentiment = parsed.sentiment;
    call.intent = parsed.intent;
    call.resolved = parsed.resolved;
    call.language = parsed.language || call.language;
    call.actionItems = parsed.action_items;
    call.upsellOpportunity = parsed.upsell_opportunity || undefined;
    await upsertCall(call);

    emitWebhook(business, "call.analyzed", {
      callId: call.id,
      summary: call.summary,
      sentiment: call.sentiment,
      intent: call.intent,
      resolved: call.resolved,
      actionItems: call.actionItems,
    });

    // Materialize action items so they land in the staff task queue.
    for (const item of parsed.action_items) {
      await addActionItem({
        id: newId("task"),
        businessId: business.id,
        callId: call.id,
        text: item,
        customerPhone: call.callerPhone,
        done: false,
        createdAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("call analysis failed", err);
  }
  return call;
}
