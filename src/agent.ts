import {
  GoogleGenerativeAI,
  Content,
  Part,
  FunctionDeclaration,
  SchemaType,
} from "@google/generative-ai";
import { SYSTEM_PROMPT } from "./prompt";
import { getToolByName, getToolDeclarations } from "./tools";
import { Spinner } from "./spinner";

const MODEL_CONTEXT_LIMIT = 1_000_000; // Gemini Flash context window
const CHARS_PER_TOKEN = 4; // Rough estimate

function toGeminiFunctionDeclarations() {
  return getToolDeclarations().map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: SchemaType.OBJECT,
      properties: t.parameters.properties,
      required: t.parameters.required,
    },
  })) as FunctionDeclaration[];
}

interface FunctionCallWithSig {
  name: string;
  args: Record<string, unknown>;
  thoughtSignature?: string;
}

export class Agent {
  private model;
  private conversation: Content[] = [];
  private spinner = new Spinner();

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: toGeminiFunctionDeclarations() }],
    });
  }

  getContextUsage(): { used: number; limit: number; percent: number } {
    let charCount = SYSTEM_PROMPT.length;
    for (const msg of this.conversation) {
      for (const part of msg.parts) {
        if ("text" in part && part.text) charCount += part.text.length;
        if ("functionCall" in part) charCount += JSON.stringify(part.functionCall).length;
        if ("functionResponse" in part) charCount += JSON.stringify(part.functionResponse).length;
      }
    }
    const usedTokens = Math.round(charCount / CHARS_PER_TOKEN);
    const percent = Math.round((usedTokens / MODEL_CONTEXT_LIMIT) * 100);
    return { used: usedTokens, limit: MODEL_CONTEXT_LIMIT, percent };
  }

  clearConversation() {
    this.conversation = [];
  }

  async compact(): Promise<string> {
    const summaryPrompt: Content = {
      role: "user",
      parts: [{ text: "Summarize our conversation so far in a concise paragraph. Focus on key decisions, code changes, and current state. This will replace the conversation history." }],
    };

    const result = await this.model.generateContent({
      contents: [...this.conversation, summaryPrompt],
    });

    const summary = result.response.text();
    this.conversation = [
      { role: "user", parts: [{ text: `[Conversation Summary]\n${summary}` }] },
      { role: "model", parts: [{ text: "Got it. I have the context from our previous conversation." }] },
    ];
    return summary;
  }

  async chat(userMessage: string): Promise<string> {
    this.conversation.push({
      role: "user",
      parts: [{ text: userMessage }],
    });

    while (true) {
      this.spinner.start();
      let result;
      try {
        result = await this.model.generateContentStream({
          contents: this.conversation,
        });
      } catch (error) {
        this.spinner.stop();
        throw error;
      }

      let text = "";
      let textThoughtSig: string | undefined;
      const functionCalls: FunctionCallWithSig[] = [];
      let firstChunk = true;

      try {
      for await (const chunk of result.stream) {
        if (firstChunk) {
          this.spinner.stop();
          firstChunk = false;
        }
        const chunkText = chunk.text();
        if (chunkText) {
          process.stdout.write(chunkText);
          text += chunkText;
        }

        // Extract thoughtSignature from raw candidates
        const candidates = (chunk as any).candidates;
        if (candidates?.[0]?.content?.parts) {
          for (const part of candidates[0].content.parts) {
            if (part.functionCall) {
              functionCalls.push({
                name: part.functionCall.name,
                args: part.functionCall.args || {},
                thoughtSignature: part.thoughtSignature,
              });
            }
            if (part.text && part.thoughtSignature) {
              textThoughtSig = part.thoughtSignature;
            }
          }
        }
      }
      } catch (error) {
        this.spinner.stop();
        throw error;
      }

      if (functionCalls.length > 0) {
        // Store model response with thoughtSignature
        const modelParts: Part[] = functionCalls.map((call) => ({
          functionCall: { name: call.name, args: call.args },
          thoughtSignature: call.thoughtSignature,
        } as any));

        this.conversation.push({
          role: "model",
          parts: modelParts,
        });

        const functionResponses: Part[] = [];
        for (const call of functionCalls) {
          const tool = getToolByName(call.name);
          if (!tool) {
            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: { error: `Unknown tool: ${call.name}` },
              },
            });
            continue;
          }

          try {
            const toolResult = await tool.execute(call.args);
            const response =
              typeof toolResult === "string" ? { output: toolResult } : toolResult;
            const success = !("error" in response);
            console.log(`\n[${call.name}] ${success ? "✓" : "✗"}`);
            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: response,
              },
            });
          } catch (error) {
            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: { error: String(error) },
              },
            });
          }
        }

        this.conversation.push({
          role: "user",
          parts: functionResponses,
        });

        continue;
      }

      if (text) {
        const textPart: any = { text };
        if (textThoughtSig) textPart.thoughtSignature = textThoughtSig;
        
        this.conversation.push({
          role: "model",
          parts: [textPart],
        });
        return text;
      }

      return "";
    }
  }
}
