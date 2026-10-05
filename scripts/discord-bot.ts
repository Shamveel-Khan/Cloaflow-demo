// Cloaflow Discord Voice Bot Runner
//   npm run discord
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { createDiscordBot } from "../lib/discord/bot";
import { getAIProvider } from "../lib/ai/provider";

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error("❌ Error: DISCORD_BOT_TOKEN is not set.");
  console.error("Please add DISCORD_BOT_TOKEN=your_bot_token to your .env file and try again.");
  process.exit(1);
}

// Check and display AI Provider configuration for Discord
const selectedProviderType = (
  process.env.DISCORD_AI_PROVIDER ||
  process.env.AI_PROVIDER ||
  ""
).toLowerCase().trim();

const provider = getAIProvider(process.env.DISCORD_AI_PROVIDER || process.env.AI_PROVIDER);
const ttsProvider = process.env.TTS_PROVIDER || "edge";

console.log("🚀 Starting Cloaflow Discord Voice Receptionist...");
if (provider.id === "openai") {
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  console.log(`🤖 AI Provider: OpenAI-compatible (${model} via ${base})`);
} else {
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  console.log(`🤖 AI Provider: Anthropic Claude (${model})`);
}
console.log(`🔊 TTS Provider: ${ttsProvider}`);

const { start } = createDiscordBot(token);

start()
  .then(() => {
    console.log("✅ Cloaflow Discord Bot is active!");
    console.log("👉 Join a voice channel in your Discord server and type `!join` to start.");
  })
  .catch((err) => {
    console.error("❌ Failed to start Discord Bot:", err);
    process.exit(1);
  });
