import type { Business } from "../types";
import type { ToolOutcome } from "../agent/tools";

export type { ToolOutcome };

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AgentTurnOptions {
  language?: string;
  callerContext?: string;
  provider?: string | AIProvider;
}

export interface AgentTurnResult {
  reply: string;
  events: NonNullable<ToolOutcome["event"]>[];
  language?: string;
}

export interface AgentToolSpec {
  name: string;
  description?: string;
  input_schema: {
    type: "object";
    properties?: any;
    required?: string[] | null;
    [key: string]: any;
  };
}

export interface StructuredOutputRequest {
  systemPrompt?: string;
  userPrompt: string;
  schema: Record<string, unknown>;
  schemaName?: string;
  maxTokens?: number;
}

export interface TextGenerationRequest {
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
}

export interface AgentLoopParams {
  business: Business;
  history: ChatTurn[];
  userMessage: string;
  opts?: AgentTurnOptions;
  tools: AgentToolSpec[];
  systemPrompt: string;
  executeTool: (name: string, input: Record<string, unknown>) => Promise<ToolOutcome>;
}

export interface AIProvider {
  readonly id: "anthropic" | "openai";
  runAgentTurn(params: AgentLoopParams): Promise<AgentTurnResult>;
  generateStructured<T>(req: StructuredOutputRequest): Promise<T>;
  generateText(req: TextGenerationRequest): Promise<string>;
}
