import OpenAI from "openai";
import type { Tool } from "../tools/types";
import type { Message, StreamChunk, ToolCall } from "./types";

export class GLMProvider {
  name = "glm";
  private client: OpenAI;
  private model: string;
  private tools: Tool[];
  private systemPrompt: string;

  constructor(tools: Tool[], prompt: string, model = "glm-4.7") {
    this.tools = tools;
    this.systemPrompt = prompt;
    this.model = model;

    const apiKey = process.env.GLM_API_KEY;
    if (!apiKey) {
      throw new Error("GLM_API_KEY environment variable is required");
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: "https://open.bigmodel.cn/api/coding/paas/v4",
    });
  }

  private toOpenAITools() {
    return this.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }

  private toOpenAIMessages(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: this.systemPrompt },
    ];

    for (const msg of messages) {
      if (msg.role === "user") {
        result.push({ role: "user", content: msg.content || "" });
      } else if (msg.role === "assistant") {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          result.push({
            role: "assistant",
            content: msg.content || null,
            tool_calls: msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.args),
              },
            })),
          });
        } else {
          result.push({ role: "assistant", content: msg.content || "" });
        }
      } else if (msg.role === "tool") {
        result.push({
          role: "tool",
          tool_call_id: msg.toolCallId || "",
          content: msg.content || "",
        });
      }
    }

    return result;
  }

  async *chat(messages: Message[]): AsyncGenerator<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: this.toOpenAIMessages(messages),
      tools: this.toOpenAITools(),
      stream: true,
    });

    const toolCalls: Map<number, { id: string; name: string; args: string }> = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        yield { type: "text", text: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCalls.has(idx)) {
            toolCalls.set(idx, { id: tc.id || "", name: tc.function?.name || "", args: "" });
          }
          const entry = toolCalls.get(idx)!;
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name = tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
        }
      }
    }

    for (const [, tc] of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.args);
      } catch {}
      yield {
        type: "tool_call",
        toolCall: { id: tc.id, name: tc.name, args },
      };
    }

    yield { type: "done" };
  }
}
