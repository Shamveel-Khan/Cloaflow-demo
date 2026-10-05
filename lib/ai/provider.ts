import type { AIProvider } from "./types";
import { AnthropicProvider } from "./anthropic";
import { OpenAICompatibleProvider } from "./openai";

const providersCache = new Map<string, AIProvider>();

/**
 * Check whether an API key appears to be a real key rather than an example placeholder.
 */
function isRealApiKey(key?: string): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  if (trimmed.length < 8) return false;
  if (
    trimmed.includes("...") ||
    trimmed.includes("your_") ||
    trimmed.includes("change-me") ||
    trimmed.includes("xxx") ||
    trimmed === "sk-ant-" ||
    trimmed === "sk-"
  ) {
    return false;
  }
  return true;
}

/**
 * Returns an AI Provider instance.
 *
 * @param providerOverride Optional provider type ('openai' | 'anthropic' | 'groq' | etc.) or an AIProvider instance.
 */
export function getAIProvider(providerOverride?: string | AIProvider): AIProvider {
  if (providerOverride && typeof providerOverride !== "string") {
    return providerOverride;
  }

  const raw = (providerOverride || process.env.AI_PROVIDER || "").toLowerCase().trim();

  let target: "openai" | "anthropic";

  if (
    raw === "openai" ||
    raw === "openai-compatible" ||
    raw === "groq" ||
    raw === "ollama" ||
    raw === "deepseek" ||
    raw === "vllm" ||
    raw === "openrouter"
  ) {
    target = "openai";
  } else if (raw === "anthropic" || raw === "claude") {
    target = "anthropic";
  } else {
    // Auto-detection based on valid credentials
    const hasAnthropic = isRealApiKey(process.env.ANTHROPIC_API_KEY);
    const hasOpenAI = isRealApiKey(process.env.OPENAI_API_KEY) || Boolean(process.env.OPENAI_BASE_URL);

    if (hasAnthropic) {
      target = "anthropic";
    } else if (hasOpenAI) {
      target = "openai";
    } else {
      target = "anthropic"; // default
    }
  }

  if (providersCache.has(target)) {
    return providersCache.get(target)!;
  }

  const instance = target === "openai" ? new OpenAICompatibleProvider() : new AnthropicProvider();
  providersCache.set(target, instance);
  return instance;
}

export * from "./types";
export * from "./anthropic";
export * from "./openai";
