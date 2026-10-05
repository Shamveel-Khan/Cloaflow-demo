// Central view of which integrations are configured. Used by the health
// endpoint and any code that wants to degrade gracefully.

export const env = {
  hasAnthropic: () => Boolean(process.env.ANTHROPIC_API_KEY),
  hasOpenAI: () => Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL),
  hasAI: () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL),
  getAIProviderName: () => {
    const p = (process.env.AI_PROVIDER || "").toLowerCase();
    if (p === "openai" || p === "openai-compatible") return "OpenAI-compatible";
    if (process.env.ANTHROPIC_API_KEY) return "Anthropic (Claude)";
    if (process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL) return "OpenAI-compatible";
    return "None (API key missing)";
  },
  hasTwilio: () =>
    Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_PHONE_NUMBER
    ),
  hasDashboardAuth: () => Boolean(process.env.DASHBOARD_TOKEN || process.env.DEMO_PASSWORD),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

// Human-readable startup summary — call from a script or the health route.
export function integrationSummary(): string[] {
  const notes: string[] = [];
  if (env.hasAI()) {
    notes.push(`✓ AI Provider configured: ${env.getAIProviderName()}`);
  } else {
    notes.push("✗ AI API key missing (set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.local)");
  }
  notes.push(
    env.hasTwilio()
      ? "✓ Twilio configured — real calls & SMS enabled"
      : "○ Twilio not set — web demo only, SMS is a no-op"
  );
  notes.push(
    env.hasDashboardAuth()
      ? "✓ Dashboard auth enabled"
      : "○ Dashboard demo mode active"
  );
  return notes;
}
