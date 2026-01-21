import type { Tool, DiffInfo } from "./tools/types";
import type { CanonicalMessage, CanonicalToolCall } from "./llm/types";
import { createLLMClient } from "./llm/router";
import {
  defaultModelForProvider,
  getDefaultModel,
  getModelById,
  resolveModelId,
  type ProviderName,
} from "./llm/models";
import { Logger } from "../shared/Logger";

const MODEL_CONTEXT_LIMIT = 1_000_000;
const CHARS_PER_TOKEN = 4;

export interface ChatCallbacks {
  onChunk?: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>, success: boolean, diff?: DiffInfo) => void;
  // Called when model finishes text and is about to call tools (allows UI to finalize text block)
  onTextComplete?: () => void;
  // TUI-only: stream tool call assembly (OpenAI-compatible).
  onToolCallDelta?: (delta: {
    index: number;
    id?: string;
    name?: string;
    argsText?: string;
  }) => void;
}

export class AbortError extends Error {
  constructor(public partialText: string) {
    super("Response aborted");
    this.name = "AbortError";
  }
}

export class Agent {
  private llm;
  private tools: Tool[];
  private conversation: CanonicalMessage[];

  private providerScope: ProviderName;
  private currentModelId: string;

  constructor(tools: Tool[], prompt: string, modelId?: string) {
    this.tools = tools;
    this.providerScope = getDefaultModel().provider;
    this.currentModelId = modelId ?? getDefaultModel().id;
    this.llm = createLLMClient(this.currentModelId);

    // Store the system prompt in the canonical conversation.
    this.conversation = [{ role: "system", content: prompt }];
  }

  getContextUsage(): { used: number; limit: number; percent: number } {
    let charCount = 0;
    for (const msg of this.conversation) {
      charCount += msg.content.length;
      if (msg.toolCalls) charCount += JSON.stringify(msg.toolCalls).length;
    }
    const usedTokens = Math.round(charCount / CHARS_PER_TOKEN);
    const percent = Math.round((usedTokens / MODEL_CONTEXT_LIMIT) * 100);
    return { used: usedTokens, limit: MODEL_CONTEXT_LIMIT, percent };
  }

  getConversation(): CanonicalMessage[] {
    return this.conversation;
  }

  setConversation(conversation: CanonicalMessage[]) {
    this.conversation = conversation;
  }

  clearConversation() {
    const system = this.conversation.find((m) => m.role === "system");
    this.conversation = system ? [system] : [];
  }

  getModelId(): string {
    return this.currentModelId;
  }

  setProvider(name: ProviderName) {
    this.providerScope = name;
    const model = defaultModelForProvider(name);
    this.setModel(model.id);
  }

  setModel(modelIdOrShort: string) {
    const resolved = resolveModelId(modelIdOrShort, this.providerScope);
    if (!resolved) throw new Error(`Unknown model: ${modelIdOrShort}`);
    const model = getModelById(resolved);
    if (!model) throw new Error(`Unknown model: ${modelIdOrShort}`);
    this.currentModelId = model.id;
    this.llm = createLLMClient(this.currentModelId);
  }

  async compact(): Promise<string> {
    this.conversation.push({
      role: "user",
      content:
        "Summarize our conversation so far in a concise paragraph. Focus on key decisions, code changes, and current state. This will replace the conversation history.",
    });

    let summary = "";
    for await (const event of this.llm.chat({
      messages: this.conversation,
      tools: this.tools,
    })) {
      if (event.type === "text_delta") summary += event.text;
    }

    const system = this.conversation.find((m) => m.role === "system");
    this.conversation = [
      ...(system ? [system] : []),
      { role: "user", content: `[Conversation Summary]\n${summary}` },
      { role: "assistant", content: "Got it. I have the context from our previous conversation." },
    ];
    return summary;
  }

  async chat(userMessage: string, callbacks?: ChatCallbacks, abortSignal?: AbortSignal): Promise<string> {
    this.conversation.push({ role: "user", content: userMessage });
    Logger.debug("User message", userMessage);

    while (true) {
      Logger.llm("Starting generation");

      let text = "";
      const toolCalls: CanonicalToolCall[] = [];

      try {
        for await (const event of this.llm.chat({
          messages: this.conversation,
          tools: this.tools,
          abortSignal,
        })) {
          if (abortSignal?.aborted) {
            if (text) this.conversation.push({ role: "assistant", content: text });
            throw new AbortError(text);
          }

          if (event.type === "text_delta" && event.text) {
            callbacks?.onChunk?.(event.text);
            text += event.text;
          }

          if (event.type === "thinking_delta" && event.text) {
            callbacks?.onThinking?.(event.text);
          }

          if (event.type === "tool_call") {
            // Notify that text is complete before first tool call
            if (toolCalls.length === 0 && text) {
              callbacks?.onTextComplete?.();
            }
            toolCalls.push(event.toolCall);
          }

          if (event.type === "tool_call_delta") {
            // Notify that text is complete when we start seeing tool deltas
            if (text && toolCalls.length === 0) {
              callbacks?.onTextComplete?.();
            }
            callbacks?.onToolCallDelta?.({
              index: event.index,
              id: event.id,
              name: event.name,
              argsText: event.argsText,
            });
          }

          if (event.type === "error") {
            throw event.error;
          }
        }
      } catch (error) {
        if (error instanceof AbortError) throw error;
        if (error instanceof Error && error.name === "AbortError") {
          if (text) this.conversation.push({ role: "assistant", content: text });
          throw new AbortError(text);
        }
        Logger.debug("LLM error", error);
        throw error;
      }

      if (toolCalls.length > 0) {
        this.conversation.push({ role: "assistant", content: text, toolCalls });

        for (const call of toolCalls) {
          const tool = this.tools.find((t) => t.name === call.name);
          if (!tool) {
            this.conversation.push({
              role: "tool",
              toolCallId: call.id,
              content: JSON.stringify({ error: `Unknown tool: ${call.name}` }),
              providerMeta: { toolName: call.name, thoughtSignature: call.thoughtSignature },
            });
            callbacks?.onToolCall?.(call.name, call.args as Record<string, unknown>, false);
            continue;
          }

          try {
            Logger.tool(call.name, call.args, "executing...");
            const toolResult = await tool.execute(call.args);
            const response = typeof toolResult === "string" ? { output: toolResult } : toolResult;
            const success = !(response && typeof response === "object" && "error" in response && response.error);
            const diff = response && typeof response === "object" && "diff" in response ? (response as any).diff : undefined;
            Logger.tool(call.name, call.args, response);

            callbacks?.onToolCall?.(call.name, call.args as Record<string, unknown>, success, diff);

            this.conversation.push({
              role: "tool",
              toolCallId: call.id,
              content: JSON.stringify(response),
              providerMeta: { toolName: call.name, thoughtSignature: call.thoughtSignature },
            });
          } catch (error) {
            Logger.debug("Tool execution error", { tool: call.name, error: String(error) });
            callbacks?.onToolCall?.(call.name, call.args as Record<string, unknown>, false);
            this.conversation.push({
              role: "tool",
              toolCallId: call.id,
              content: JSON.stringify({ error: String(error) }),
              providerMeta: { toolName: call.name, thoughtSignature: call.thoughtSignature },
            });
          }
        }

        continue;
      }

      if (text) {
        this.conversation.push({ role: "assistant", content: text });
        Logger.debug("Assistant response length", text.length);
        return text;
      }

      return "";
    }
  }

  // Compatibility: existing UI/CLI call sites use restoreConversation.
  restoreConversation(messages: CanonicalMessage[]) {
    this.conversation = messages;
  }
}
