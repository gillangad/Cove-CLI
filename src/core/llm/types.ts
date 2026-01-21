import type { Tool } from "../tools/types";

export type LLMRole = "system" | "user" | "assistant" | "tool";

export interface CanonicalToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /**
   * Gemini thought signatures (when thinking is enabled).
   * Not used by most providers.
   */
  thoughtSignature?: string;
}

export interface CanonicalMessage {
  role: LLMRole;
  content: string;

  // assistant-only
  toolCalls?: CanonicalToolCall[];

  // tool-only
  toolCallId?: string;

  // Optional escape hatch for provider-specific metadata.
  providerMeta?: Record<string, unknown>;
}

export type CanonicalConversation = CanonicalMessage[];

export type ProviderName = "glm" | "openai" | "anthropic" | "google";

export type ModelApi =
  | "openai_chat_completions"
  | "anthropic_messages"
  | "google_generative_ai";

export interface ModelInfo {
  id: string; // globally-unique: provider/model
  provider: ProviderName;
  api: ModelApi;

  displayName: string;
  description?: string;
  isDefault?: boolean;

  // Routing / auth
  baseUrl?: string;
  envKey: string;

  // Display + future budgeting
  contextWindow?: number;
  maxOutputTokens?: number;

  supportsTools?: boolean;
  supportsThinking?: boolean;
}

export interface LLMRequest {
  model: ModelInfo;
  messages: CanonicalConversation;
  tools: Tool[];
  abortSignal?: AbortSignal;
}
