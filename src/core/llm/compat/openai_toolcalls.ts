import type OpenAI from "openai";
import type { CanonicalToolCall } from "../types";

export function stitchOpenAIToolCalls(
  toolCalls: Map<number, { id: string; name: string; args: string }>,
  deltaToolCalls?: OpenAI.ChatCompletionChunk.Choice.Delta.ToolCall[]
): Array<{ index: number; toolCall: { id: string; name: string; args: string } }> {
  if (!deltaToolCalls) return [];
  const touched = new Set<number>();
  for (const tc of deltaToolCalls) {
    const idx = tc.index;
    if (!toolCalls.has(idx)) {
      toolCalls.set(idx, { id: tc.id || "", name: tc.function?.name || "", args: "" });
    }
    const entry = toolCalls.get(idx)!;
    if (tc.id) entry.id = tc.id;
    if (tc.function?.name) entry.name = tc.function.name;
    if (tc.function?.arguments) entry.args += tc.function.arguments;
    touched.add(idx);
  }

  const out: Array<{ index: number; toolCall: { id: string; name: string; args: string } }> = [];
  for (const idx of touched) {
    const tc = toolCalls.get(idx);
    if (!tc) continue;
    out.push({ index: idx, toolCall: tc });
  }
  return out;
}

export function finalizeOpenAIToolCalls(
  toolCalls: Map<number, { id: string; name: string; args: string }>
): CanonicalToolCall[] {
  const out: CanonicalToolCall[] = [];
  for (const [, tc] of toolCalls) {
    let args: Record<string, unknown> = {};
    try {
      args = tc.args ? JSON.parse(tc.args) : {};
    } catch {
      // Keep empty args (provider output may be partial JSON)
    }
    out.push({ id: tc.id, name: tc.name, args });
  }
  return out;
}
