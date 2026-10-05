import OpenAI from "openai";
import type {
  AIProvider,
  AgentLoopParams,
  AgentTurnResult,
  StructuredOutputRequest,
  TextGenerationRequest,
} from "./types";

const MAX_TOOL_ITERATIONS = 6;
const MAX_HISTORY_TURNS = 24;

export class OpenAICompatibleProvider implements AIProvider {
  readonly id = "openai" as const;
  private client: OpenAI;
  private model: string;

  constructor(apiKey?: string, baseURL?: string, model?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY || "ollama",
      baseURL: baseURL || process.env.OPENAI_BASE_URL || undefined,
    });
    this.model = model || process.env.OPENAI_MODEL || "gpt-4o";
  }

  async runAgentTurn(params: AgentLoopParams): Promise<AgentTurnResult> {
    const { history, userMessage, opts = {}, tools, systemPrompt, executeTool } = params;
    const events: AgentTurnResult["events"] = [];
    let language = opts.language;

    // Sliding window: keep recent turns
    let windowed = history.slice(-MAX_HISTORY_TURNS);
    while (windowed.length && windowed[0].role !== "user") {
      windowed = windowed.slice(1);
    }

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...windowed.map((t) => ({
        role: t.role as "user" | "assistant",
        content: t.content,
      })),
      { role: "user", content: userMessage },
    ];

    const openAITools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      let response: OpenAI.ChatCompletion;
      try {
        response = await this.client.chat.completions.create({
          model: this.model,
          messages,
          tools: openAITools.length > 0 ? openAITools : undefined,
          tool_choice: openAITools.length > 0 ? "auto" : undefined,
          temperature: 0.3,
        });
      } catch (err: unknown) {
        console.error("openai-compatible agent turn failed", err);
        const error = err as { status?: number; message?: string };
        if (error?.status === 401) {
          return {
            reply:
              "Configuration issue: the OpenAI / AI provider API key is invalid. Check OPENAI_API_KEY in .env.local and restart the server.",
            events: [],
            language,
          };
        }
        if (error?.status === 429 || error?.status === 500 || error?.status === 503) {
          return {
            reply:
              "I'm sorry, our line is very busy right now. Let me connect you to a staff member.",
            events: ["transfer_requested"],
            language,
          };
        }
        throw err;
      }

      const choice = response.choices?.[0];
      if (!choice || !choice.message) {
        return {
          reply: "I'm having trouble understanding. Let me connect you to a staff member.",
          events: ["transfer_requested"],
          language,
        };
      }

      const choiceMessage = choice.message;

      if (choiceMessage.tool_calls && choiceMessage.tool_calls.length > 0) {
        messages.push(choiceMessage);

        for (const toolCall of choiceMessage.tool_calls) {
          let parsedInput: Record<string, unknown> = {};
          try {
            parsedInput = JSON.parse(toolCall.function.arguments || "{}");
          } catch {
            parsedInput = {};
          }

          const outcome = await executeTool(toolCall.function.name, parsedInput);
          if (outcome.event) events.push(outcome.event);
          if (outcome.language) {
            language = outcome.language;
          }

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: outcome.result,
          });
        }
        continue;
      }

      const replyText = (choiceMessage.content || "").trim();
      return {
        reply: replyText || "I'm sorry, could you repeat that?",
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
    const schemaInstruction = `You must return ONLY valid JSON matching this exact JSON schema:
${JSON.stringify(req.schema, null, 2)}
Do not wrap your output in markdown code blocks or add any explanations.`;

    const systemContent = req.systemPrompt
      ? `${req.systemPrompt}\n\n${schemaInstruction}`
      : schemaInstruction;

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
      { role: "user", content: req.userPrompt },
    ];

    let responseText = "";

    try {
      // First attempt: use json_schema or json_object response format
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: req.maxTokens || 2048,
      });
      responseText = response.choices?.[0]?.message?.content || "";
    } catch {
      // Fallback for providers that don't support response_format param
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.1,
        max_tokens: req.maxTokens || 2048,
      });
      responseText = response.choices?.[0]?.message?.content || "";
    }

    if (!responseText) {
      throw new Error("Empty structured response from OpenAI provider");
    }

    // Clean markdown code blocks if the model included them
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.slice(7);
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.slice(3);
    }
    if (cleanJson.endsWith("```")) {
      cleanJson = cleanJson.slice(0, -3);
    }
    cleanJson = cleanJson.trim();

    return JSON.parse(cleanJson) as T;
  }

  async generateText(req: TextGenerationRequest): Promise<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    if (req.systemPrompt) {
      messages.push({ role: "system", content: req.systemPrompt });
    }
    messages.push({ role: "user", content: req.userPrompt });

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: req.maxTokens || 1024,
      temperature: 0.3,
    });

    return (response.choices?.[0]?.message?.content || "").trim();
  }
}
