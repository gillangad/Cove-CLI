import type { Tool } from "../tools/types";
import { GLMProvider } from "./glm";

export function createProvider(
  tools: Tool[],
  prompt: string,
  model?: string
) {
  return new GLMProvider(tools, prompt, model);
}

export { GLMProvider } from "./glm";
export type { Message, StreamChunk, ToolCall } from "./types";
