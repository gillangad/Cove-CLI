import type { ModelInfo } from "./types";

export function requireEnvKey(model: ModelInfo): string {
  const key = model.envKey;
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key}. Set it in ~/.cove/.env or your environment.`);
  }
  return value;
}
