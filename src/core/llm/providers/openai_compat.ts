import OpenAI from "openai";
import type { Tool } from "../../tools/types";
import type { CanonicalConversation, CanonicalMessage, ModelInfo } from "../types";
import type { LLMStreamEvent } from "../events";
import { requireEnvKey } from "../auth";
import { finalizeOpenAIToolCalls, stitchOpenAIToolCalls } from "../compat/openai_toolcalls";

function toOpenAITools(tools: Tool[]): OpenAI.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

function toOpenAIMessages(messages: CanonicalConversation): OpenAI.ChatCompletionMessageParam[] {
  const out: OpenAI.ChatCompletionMessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      out.push({ role: "system", content: msg.content });
      continue;
    }
    if (msg.role === "user") {
      out.push({ role: "user", content: msg.content });
      continue;
    }
    if (msg.role === "assistant") {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        out.push({
          role: "assistant",
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
          })),
        });
      } else {
        out.push({ role: "assistant", content: msg.content });
      }
      continue;
    }
    if (msg.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: msg.toolCallId || "",
        content: msg.content || "",
      });
      continue;
    }
  }

  return out;
}

/**
 * Streaming parser for <think> tags in content.
 * Buffers content to detect think tag boundaries and emits appropriate events.
 */
class ThinkTagParser {
  private buffer = "";
  private inThinkBlock = false;

  /**
   * Process incoming text chunk and return events to emit
   */
  process(text: string): Array<{ type: "thinking" | "text"; content: string }> {
    this.buffer += text;
    const events: Array<{ type: "thinking" | "text"; content: string }> = [];

    while (true) {
      if (!this.inThinkBlock) {
        // Look for <think> tag
        const thinkStart = this.buffer.indexOf("<think>");
        if (thinkStart === -1) {
          // No think tag found - emit buffered text (keep last 7 chars in case of partial tag)
          if (this.buffer.length > 7) {
            const toEmit = this.buffer.slice(0, -7);
            events.push({ type: "text", content: toEmit });
            this.buffer = this.buffer.slice(-7);
          }
          break;
        } else {
          // Found <think> - emit text before it
          if (thinkStart > 0) {
            events.push({ type: "text", content: this.buffer.slice(0, thinkStart) });
          }
          this.buffer = this.buffer.slice(thinkStart + 7); // Remove <think>
          this.inThinkBlock = true;
        }
      } else {
        // Inside think block - look for </think>
        const thinkEnd = this.buffer.indexOf("</think>");
        if (thinkEnd === -1) {
          // No end tag found - emit buffered thinking (keep last 8 chars for partial tag)
          if (this.buffer.length > 8) {
            const toEmit = this.buffer.slice(0, -8);
            events.push({ type: "thinking", content: toEmit });
            this.buffer = this.buffer.slice(-8);
          }
          break;
        } else {
          // Found </think> - emit thinking content
          if (thinkEnd > 0) {
            events.push({ type: "thinking", content: this.buffer.slice(0, thinkEnd) });
          }
          this.buffer = this.buffer.slice(thinkEnd + 8); // Remove </think>
          this.inThinkBlock = false;
        }
      }
    }

    return events;
  }

  /**
   * Flush remaining buffer content
   */
  flush(): Array<{ type: "thinking" | "text"; content: string }> {
    const events: Array<{ type: "thinking" | "text"; content: string }> = [];
    if (this.buffer) {
      events.push({ type: this.inThinkBlock ? "thinking" : "text", content: this.buffer });
      this.buffer = "";
    }
    return events;
  }
}

export class OpenAICompatClient {
  readonly model: ModelInfo;
  private client: OpenAI;

  constructor(model: ModelInfo) {
    this.model = model;
    const apiKey = requireEnvKey(model);
    this.client = new OpenAI({
      apiKey,
      baseURL: model.baseUrl,
    });
  }

  async *chat(request: {
    messages: CanonicalConversation;
    tools: Tool[];
    abortSignal?: AbortSignal;
  }): AsyncGenerator<LLMStreamEvent> {
    yield { type: "response_start", modelId: this.model.id };

    const stream = await this.client.chat.completions.create(
      {
        model: this.model.id.split("/")[1]!,
        messages: toOpenAIMessages(request.messages),
        tools: toOpenAITools(request.tools),
        stream: true,
      },
      { signal: request.abortSignal }
    );

    const toolCalls: Map<number, { id: string; name: string; args: string }> = new Map();
    const thinkParser = new ThinkTagParser();
    let hasReasoningContent = false;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Handle reasoning/thinking content (GLM and other models)
      // GLM sends reasoning_content in the delta for thinking models
      const deltaAny = delta as any;
      if (deltaAny.reasoning_content) {
        hasReasoningContent = true;
        yield { type: "thinking_delta", text: deltaAny.reasoning_content };
      }

      if (delta.content) {
        // If model uses reasoning_content field, don't parse <think> tags
        if (hasReasoningContent) {
          yield { type: "text_delta", text: delta.content };
        } else {
          // Parse <think> tags from content (GLM-4.6 style)
          const events = thinkParser.process(delta.content);
          for (const event of events) {
            if (event.type === "thinking") {
              yield { type: "thinking_delta", text: event.content };
            } else {
              yield { type: "text_delta", text: event.content };
            }
          }
        }
      }

      const touched = stitchOpenAIToolCalls(toolCalls, delta.tool_calls);
      for (const t of touched) {
        yield {
          type: "tool_call_delta",
          index: t.index,
          id: t.toolCall.id || undefined,
          name: t.toolCall.name || undefined,
          argsText: t.toolCall.args || undefined,
        };
      }
    }

    // Flush any remaining content from the think parser
    if (!hasReasoningContent) {
      const remaining = thinkParser.flush();
      for (const event of remaining) {
        if (event.type === "thinking") {
          yield { type: "thinking_delta", text: event.content };
        } else {
          yield { type: "text_delta", text: event.content };
        }
      }
    }

    const finalized = finalizeOpenAIToolCalls(toolCalls);
    for (const tc of finalized) {
      yield { type: "tool_call", toolCall: tc };
    }

    yield { type: "response_done", model: this.model };
  }
}
