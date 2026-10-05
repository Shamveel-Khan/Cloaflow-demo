import { test } from "node:test";
import assert from "node:assert/strict";
import { getAIProvider, AnthropicProvider, OpenAICompatibleProvider } from "../lib/ai/provider";
import { agentTools } from "../lib/agent/tools";

test("getAIProvider defaults correctly based on environment", () => {
  const defaultProvider = getAIProvider();
  assert.ok(defaultProvider);
  assert.ok(defaultProvider.id === "anthropic" || defaultProvider.id === "openai");
});

test("AnthropicProvider instantiation and tool structure", () => {
  const provider = new AnthropicProvider("test-anthropic-key", "claude-opus-4-8");
  assert.equal(provider.id, "anthropic");
  assert.ok(agentTools.length >= 10);
  assert.ok(agentTools.some((t) => t.name === "check_availability"));
  assert.ok(agentTools.some((t) => t.name === "book_appointment"));
});

test("OpenAICompatibleProvider instantiation and tool schema mapping", () => {
  const provider = new OpenAICompatibleProvider(
    "test-openai-key",
    "https://api.openai.com/v1",
    "gpt-4o"
  );
  assert.equal(provider.id, "openai");

  // Verify all agent tools convert to OpenAI tool format properly
  const openAITools = agentTools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));

  assert.equal(openAITools.length, agentTools.length);
  const bookingTool = openAITools.find((t) => t.function.name === "book_appointment");
  assert.ok(bookingTool);
  assert.equal(bookingTool?.type, "function");
  assert.ok(bookingTool?.function.parameters);
});

test("getAIProvider respects provider overrides", () => {
  const openaiProvider = getAIProvider("openai");
  assert.equal(openaiProvider.id, "openai");

  const groqProvider = getAIProvider("groq");
  assert.equal(groqProvider.id, "openai");

  const anthropicProvider = getAIProvider("anthropic");
  assert.equal(anthropicProvider.id, "anthropic");

  // Passing an existing instance directly
  const custom = new AnthropicProvider("test-key");
  const passedThrough = getAIProvider(custom);
  assert.equal(passedThrough, custom);
});

