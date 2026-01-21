import type { Tool } from "../tools/types";
import type { LLMClient } from "./events";
import type { ModelInfo } from "./types";
import { getModelById, getDefaultModel } from "./models";
import { OpenAICompatClient } from "./providers/openai_compat";
import { AnthropicClient } from "./providers/anthropic";
import { GeminiClient } from "./providers/gemini";

export function createLLMClient(modelId?: string): LLMClient {
  const model: ModelInfo = (modelId ? getModelById(modelId) : null) ?? getDefaultModel();

  if (!model) {
    throw new Error(`Unknown model: ${modelId}`);
  }

  switch (model.api) {
    case "openai_chat_completions":
      return new OpenAICompatClient(model);
    case "anthropic_messages":
      return new AnthropicClient(model);
    case "google_generative_ai":
      return new GeminiClient(model);
    default: {
      const _exhaustive: never = model.api;
      throw new Error(`Unsupported model api: ${String(_exhaustive)}`);
    }
  }
}
