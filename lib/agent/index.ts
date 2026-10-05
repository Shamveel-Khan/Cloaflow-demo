import type { Business } from "../types";
import { buildSystemPrompt, type PromptContext } from "./prompt";
import { agentTools, executeTool } from "./tools";
import { getAIProvider } from "../ai/provider";
import type { AgentTurnResult, ChatTurn, AgentTurnOptions } from "../ai/types";

export type { AgentTurnResult, ChatTurn, AgentTurnOptions };

// Runs one conversational turn: caller says something, Cloaflow replies.
// Handles the tool-use loop (check availability → book → confirm, etc)
// via the configured AI provider (Anthropic Claude or OpenAI-compatible).
export async function runAgentTurn(
  business: Business,
  history: ChatTurn[],
  userMessage: string,
  opts: AgentTurnOptions = {}
): Promise<AgentTurnResult> {
  const ctx: PromptContext = {
    language: opts.language,
    callerContext: opts.callerContext,
  };

  const systemPrompt = buildSystemPrompt(business, ctx);
  const provider = getAIProvider(opts.provider);

  return provider.runAgentTurn({
    business,
    history,
    userMessage,
    opts,
    tools: agentTools,
    systemPrompt,
    executeTool: async (name: string, input: Record<string, unknown>) => {
      return executeTool(business, name, input, { language: ctx.language });
    },
  });
}
