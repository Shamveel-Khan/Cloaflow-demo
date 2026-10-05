import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  AgentLoopParams,
  AgentTurnResult,
  StructuredOutputRequest,
  TextGenerationRequest,
} from "./types";

const MAX_TOOL_ITERATIONS = 6;
const MAX_HISTORY_TURNS = 24;

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic" as const;
  private client: Anthropic;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.model = model || process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  }

  async runAgentTurn(params: AgentLoopParams): Promise<AgentTurnResult> {
    const { history, userMessage, opts = {}, tools, systemPrompt, executeTool } = params;
    const events: AgentTurnResult["events"] = [];
    let language = opts.language;

    // Sliding window: keep recent turns alternating user/assistant
    let windowed = history.slice(-MAX_HISTORY_TURNS);
    while (windowed.length && windowed[0].role !== "user") {
      windowed = windowed.slice(1);
    }

    const messages: Anthropic.MessageParam[] = [
      ...windowed.map((t) => ({ role: t.role, content: t.content })),
      { role: "user" as const, content: userMessage },
    ];

    const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    }));

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      let response: Anthropic.Message;
      try {
        response = await this.client.messages.create({
          model: this.model,
          max_tokens: 1024,
          thinking: { type: "adaptive" },
          output_config: { effort: "low" },
          system: [
            {
              type: "text",
              text: systemPrompt,
              cache_control: { type: "ephemeral" },
            },
          ],
          tools: anthropicTools,
          messages,
        });
      } catch (err) {
        console.error("anthropic agent turn failed", err);
        if (err instanceof Anthropic.AuthenticationError) {
          return {
            reply:
              "Configuration issue: the Anthropic API key is invalid. Check ANTHROPIC_API_KEY in .env.local and restart the server.",
            events: [],
            language,
          };
        }
        if (
          err instanceof Anthropic.RateLimitError ||
          err instanceof Anthropic.InternalServerError ||
          err instanceof Anthropic.APIConnectionError
        ) {
          return {
            reply:
              "I'm sorry, our line is very busy right now. Let me connect you to a staff member.",
            events: ["transfer_requested"],
            language,
          };
        }
        throw err;
      }

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          const outcome = await executeTool(
            block.name,
            block.input as Record<string, unknown>
          );
          if (outcome.event) events.push(outcome.event);
          if (outcome.language) {
            language = outcome.language;
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: outcome.result,
            is_error: outcome.isError,
          });
        }
        messages.push({ role: "user", content: toolResults });
        continue;
      }

      if (response.stop_reason === "refusal") {
        return {
          reply:
            "I'm sorry, I can't help with that. Is there anything else I can do for you?",
          events,
          language,
        };
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();

      return {
        reply: text || "I'm sorry, could you repeat that?",
        events,
        language,
      };
    }

    return {
      reply:
        "I'm having a little trouble right now. Let me connect you to a staff member.",
      events: ["transfer_requested"],
      language,
    };
  }

  async generateStructured<T>(req: StructuredOutputRequest): Promise<T> {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: req.userPrompt },
    ];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens || 2048,
      system: req.systemPrompt ? [{ type: "text", text: req.systemPrompt }] : undefined,
      output_config: {
        format: {
          type: "json_schema",
          schema: req.schema as Anthropic.Beta.Messages.BetaJSONOutputFormat["schema"],
        },
      },
      messages,
    });

    if (response.stop_reason === "refusal") {
      throw new Error("Anthropic generation refused");
    }

    const text = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    )?.text;

    if (!text) {
      throw new Error("Empty structured response from Anthropic");
    }

    return JSON.parse(text) as T;
  }

  async generateText(req: TextGenerationRequest): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens || 1024,
      system: req.systemPrompt ? [{ type: "text", text: req.systemPrompt }] : undefined,
      messages: [{ role: "user", content: req.userPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();

    return text;
  }
}
