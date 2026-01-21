import type { ModelInfo, ProviderName } from "./types";

export type { ProviderName };

export const MODELS: ModelInfo[] = [
  {
    id: "glm/glm-4.7",
    provider: "glm",
    api: "openai_chat_completions",
    displayName: "GLM 4.7",
    description: "Zhipu GLM (OpenAI-compatible endpoint)",
    isDefault: true,
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    envKey: "GLM_API_KEY",
    supportsTools: true,
    supportsThinking: true,
  },

  // OpenAI
  {
    id: "openai/gpt-4o-mini",
    provider: "openai",
    api: "openai_chat_completions",
    displayName: "GPT-4o mini",
    envKey: "OPENAI_API_KEY",
    supportsTools: true,
  },
  {
    id: "openai/gpt-4o",
    provider: "openai",
    api: "openai_chat_completions",
    displayName: "GPT-4o",
    envKey: "OPENAI_API_KEY",
    supportsTools: true,
  },

  // Anthropic
  {
    id: "anthropic/claude-3-5-haiku-latest",
    provider: "anthropic",
    api: "anthropic_messages",
    displayName: "Claude 3.5 Haiku (latest)",
    envKey: "ANTHROPIC_API_KEY",
    supportsTools: true,
  },
  {
    id: "anthropic/claude-3-7-sonnet-latest",
    provider: "anthropic",
    api: "anthropic_messages",
    displayName: "Claude 3.7 Sonnet (latest)",
    envKey: "ANTHROPIC_API_KEY",
    supportsTools: true,
  },

  // Google (Gemini)
  {
    id: "google/gemini-3-flash-preview",
    provider: "google",
    api: "google_generative_ai",
    displayName: "Gemini 3 Flash (preview)",
    envKey: "GEMINI_API_KEY",
    supportsTools: true,
    supportsThinking: true,
  },
];

export function getDefaultModel(): ModelInfo {
  const m = MODELS.find((x) => x.isDefault);
  if (!m) throw new Error("No default model configured");
  return m;
}

export function listModels(): ModelInfo[] {
  return MODELS.slice();
}

export function listModelsByProvider(): Record<ProviderName, ModelInfo[]> {
  const out = {
    glm: [] as ModelInfo[],
    openai: [] as ModelInfo[],
    anthropic: [] as ModelInfo[],
    google: [] as ModelInfo[],
  } satisfies Record<ProviderName, ModelInfo[]>;

  for (const m of MODELS) {
    out[m.provider].push(m);
  }
  return out;
}

export function getModelById(id: string): ModelInfo | null {
  return MODELS.find((m) => m.id === id) ?? null;
}

export function resolveModelId(input: string, providerScope?: ProviderName): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Fully-qualified
  if (trimmed.includes("/")) {
    return getModelById(trimmed) ? trimmed : null;
  }

  // Short name within provider scope
  if (providerScope) {
    const candidate = `${providerScope}/${trimmed}`;
    return getModelById(candidate) ? candidate : null;
  }

  // No scope: attempt unique match across providers
  const matches = MODELS.filter((m) => m.id.endsWith(`/${trimmed}`));
  if (matches.length === 1) return matches[0].id;
  return null;
}

export function defaultModelForProvider(provider: ProviderName): ModelInfo {
  const models = MODELS.filter((m) => m.provider === provider);
  if (models.length === 0) throw new Error(`No models configured for provider ${provider}`);
  return models[0];
}
