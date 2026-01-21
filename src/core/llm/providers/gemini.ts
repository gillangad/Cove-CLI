import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Tool } from "../../tools/types";
import type { LLMStreamEvent } from "../events";
import type { CanonicalConversation, CanonicalMessage, CanonicalToolCall, ModelInfo } from "../types";
import { requireEnvKey } from "../auth";

function toGeminiTools(tools: Tool[]) {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema as any,
      })),
    },
  ];
}

function toGeminiHistory(messages: CanonicalConversation): {
  systemInstruction?: string;
  history: any[];
} {
  const systemParts: string[] = [];
  const history: any[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
      continue;
    }

    if (m.role === "user") {
      history.push({ role: "user", parts: [{ text: m.content }] });
      continue;
    }

    if (m.role === "assistant") {
      const parts: any[] = [];
      if (m.content) parts.push({ text: m.content });
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          const functionCallPart: any = {
            functionCall: {
              name: tc.name,
              args: tc.args ?? {},
            },
          };
          // Thought signatures: only attach if present.
          if (tc.thoughtSignature) {
            functionCallPart.thoughtSignature = tc.thoughtSignature;
          }
          parts.push(functionCallPart);
        }
      }
      history.push({ role: "model", parts });
      continue;
    }

    if (m.role === "tool") {
      let parsed: unknown = m.content;
      try {
        parsed = JSON.parse(m.content);
      } catch {
        // ignore
      }

      if (!m.providerMeta?.toolName) {
        // Without a tool name, Gemini tool response can't be matched back.
        // This should never happen because Agent sets providerMeta on tool messages.
        throw new Error("Gemini tool response missing providerMeta.toolName");
      }

      // Gemini expects function responses using role: 'function' and a functionResponse part.
      // Use toolName from providerMeta when available.
      const toolName = (m.providerMeta?.toolName as string) || "";
      history.push({
        role: "function",
        parts: [
          {
            functionResponse: {
              name: toolName,
              response: typeof parsed === "string" ? { output: parsed } : (parsed as any),
            },
          },
        ],
      });
      continue;
    }
  }

  // For Gemini, each tool response must include the preceding functionCall parts
  // (including thoughtSignature when present) in the exact order. Since our agent
  // stores tool call parts on the assistant message, we should never end up with a
  // tool message without an earlier assistant toolCalls entry in history.

  const systemInstruction = systemParts.join("\n\n").trim();
  return { systemInstruction: systemInstruction || undefined, history };
}

function extractTextDeltaFromChunk(chunk: any): string {
  const candidates = chunk?.candidates;
  const parts = candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  let out = "";
  for (const p of parts) {
    if (typeof p?.text === "string") out += p.text;
  }
  return out;
}

function extractToolCallsFromFinalResponse(response: any): CanonicalToolCall[] {
  const out: CanonicalToolCall[] = [];
  const candidates = response?.candidates;
  const parts = candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return out;

  for (const p of parts) {
    const fc = p?.functionCall;
    if (fc?.name) {
      const tc: CanonicalToolCall = {
        id: `call_${out.length}`,
        name: String(fc.name),
        args: (fc.args ?? {}) as Record<string, unknown>,
      };
      if (p?.thoughtSignature) {
        tc.thoughtSignature = String(p.thoughtSignature);
      }
      out.push(tc);
    }
  }
  return out;
}

export class GeminiClient {
  readonly model: ModelInfo;
  private genAI: GoogleGenerativeAI;

  constructor(model: ModelInfo) {
    this.model = model;
    const apiKey = requireEnvKey(model);
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async *chat(request: {
    messages: CanonicalConversation;
    tools: Tool[];
    abortSignal?: AbortSignal;
  }): AsyncGenerator<LLMStreamEvent> {
    yield { type: "response_start", modelId: this.model.id };

    // Gemini's ChatSession API expects you to provide prior turns in `history` and then
    // send the *current* user turn via sendMessageStream(). Our canonical conversation
    // always ends with the current user message (Agent appends it right before calling chat).
    const last = request.messages[request.messages.length - 1];
    const prompt = last?.role === "user" ? last.content : "";
    const historyMessages = last?.role === "user" ? request.messages.slice(0, -1) : request.messages;

    const { systemInstruction, history } = toGeminiHistory(historyMessages);
    const modelName = this.model.id.split("/")[1]!;
    const model = this.genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemInstruction || undefined,
      tools: toGeminiTools(request.tools) as any,
    });

    const chat = model.startChat({ history });
    const streamResult = await chat.sendMessageStream(prompt, {
      signal: request.abortSignal as any,
    });

    for await (const chunk of streamResult.stream) {
      const delta = extractTextDeltaFromChunk(chunk);
      if (delta) yield { type: "text_delta", text: delta };
    }

    const final = await streamResult.response;
    const toolCalls = extractToolCallsFromFinalResponse(final);
    for (const tc of toolCalls) {
      yield { type: "tool_call", toolCall: tc };
    }

    yield { type: "response_done", model: this.model };
  }
}
