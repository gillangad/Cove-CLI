import type { CanonicalToolCall, ModelInfo } from "./types";

export type LLMStreamEvent =
  | {
      type: "response_start";
      modelId: string;
    }
  | {
      type: "text_delta";
      text: string;
    }
  | {
      type: "thinking_delta";
      text: string;
    }
  | {
      // Provider streaming hint: a tool call is being assembled.
      // Currently implemented for OpenAI-compatible streaming tool calls.
      type: "tool_call_delta";
      index: number;
      id?: string;
      name?: string;
      argsText?: string;
    }
  | {
      type: "tool_call";
      toolCall: CanonicalToolCall;
    }
  | {
      type: "response_done";
      model: ModelInfo;
    }
  | {
      type: "error";
      error: Error;
    };

export interface LLMClient {
  model: ModelInfo;
  chat(request: {
    messages: import("./types").CanonicalConversation;
    tools: import("../tools/types").Tool[];
    abortSignal?: AbortSignal;
  }): AsyncGenerator<LLMStreamEvent>;
}
