import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "../../tools/types";
import type { LLMStreamEvent } from "../events";
import type { CanonicalConversation, CanonicalMessage, CanonicalToolCall, ModelInfo } from "../types";
import { requireEnvKey } from "../auth";

function toAnthropicTools(tools: Tool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as any,
  }));
}

function splitSystem(messages: CanonicalConversation): { system: string; rest: CanonicalMessage[] } {
  const systemParts: string[] = [];
  const rest: CanonicalMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") systemParts.push(m.content);
    else rest.push(m);
  }
  return { system: systemParts.join("\n\n").trim(), rest };
}

function toAnthropicMessages(messages: CanonicalMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];

  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
      continue;
    }

    if (m.role === "assistant") {
      // Represent tool calls as content blocks, plus any assistant text.
      const blocks: any[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.args ?? {},
          });
        }
      }
      out.push({ role: "assistant", content: blocks.length > 0 ? (blocks as any) : "" });
      continue;
    }

    if (m.role === "tool") {
      // Tool results must be sent as a user message containing a tool_result block.
      let parsed: unknown = m.content;
      try {
        parsed = JSON.parse(m.content);
      } catch {
        // ignore
      }
      out.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: m.toolCallId || "",
            content: typeof parsed === "string" ? parsed : JSON.stringify(parsed),
          },
        ] as any,
      });
      continue;
    }
  }

  return out;
}

export class AnthropicClient {
  readonly model: ModelInfo;
  private client: Anthropic;

  constructor(model: ModelInfo) {
    this.model = model;
    const apiKey = requireEnvKey(model);
    this.client = new Anthropic({ apiKey });
  }

  async *chat(request: {
    messages: CanonicalConversation;
    tools: Tool[];
    abortSignal?: AbortSignal;
  }): AsyncGenerator<LLMStreamEvent> {
    yield { type: "response_start", modelId: this.model.id };

    const { system, rest } = splitSystem(request.messages);
    const stream = this.client.messages.stream(
      {
        model: this.model.id.split("/")[1]!,
        max_tokens: this.model.maxOutputTokens ?? 1024,
        system: system || undefined,
        messages: toAnthropicMessages(rest),
        tools: toAnthropicTools(request.tools),
      },
      { signal: request.abortSignal as any }
    );

    // The low-level stream yields SSE-like events; text arrives via content_block_delta.
    for await (const event of stream as any) {
      if (event?.type === "content_block_delta") {
        if (event?.delta?.type === "text_delta") {
          const text = String(event.delta.text ?? "");
          if (text) yield { type: "text_delta", text };
        }
        // Handle thinking blocks (Claude extended thinking)
        if (event?.delta?.type === "thinking_delta") {
          const text = String(event.delta.thinking ?? "");
          if (text) yield { type: "thinking_delta", text };
        }
      }
    }

    const final = await stream.finalMessage();

    // Extract tool_use blocks.
    const contentBlocks = final.content as any[];
    if (Array.isArray(contentBlocks)) {
      for (const block of contentBlocks) {
        if (block?.type === "tool_use") {
          const tc: CanonicalToolCall = {
            id: String(block.id ?? ""),
            name: String(block.name ?? ""),
            args: (block.input ?? {}) as Record<string, unknown>,
          };
          yield { type: "tool_call", toolCall: tc };
        }
      }
    }

    yield { type: "response_done", model: this.model };
  }
}
