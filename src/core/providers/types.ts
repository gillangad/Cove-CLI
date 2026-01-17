import type { Tool } from "../tools/types";

export interface ProviderConfig {
  tools: Tool[];
  prompt: string;
}

export interface Provider {
  chat(messages: Message[]): AsyncGenerator<StreamChunk>;
  name: string;
}

export interface Message {
  role: "user" | "assistant" | "tool";
  content?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  thoughtSignature?: string; // Required for Gemini 3 thinking models
}

export interface StreamChunk {
  type: "text" | "tool_call" | "done";
  text?: string;
  toolCall?: ToolCall;
}
