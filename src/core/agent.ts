import type { Tool } from "./tools/types";
import { createProvider, type Message, type ToolCall } from "./providers";
import { Spinner } from "../shared/spinner";
import { Logger } from "../shared/Logger";

const MODEL_CONTEXT_LIMIT = 1_000_000;
const CHARS_PER_TOKEN = 4;

export interface ChatCallbacks {
  onChunk?: (text: string) => void;
  onToolCall?: (name: string, success: boolean) => void;
}

export class Agent {
  private provider;
  private tools: Tool[];
  private prompt: string;
  private conversation: Message[] = [];
  private spinner = new Spinner();

  constructor(tools: Tool[], prompt: string, model?: string) {
    this.tools = tools;
    this.prompt = prompt;
    this.provider = createProvider(tools, prompt, model);
  }

  getContextUsage(): { used: number; limit: number; percent: number } {
    let charCount = this.prompt.length;
    for (const msg of this.conversation) {
      if (msg.content) charCount += msg.content.length;
      if (msg.toolCalls) charCount += JSON.stringify(msg.toolCalls).length;
    }
    const usedTokens = Math.round(charCount / CHARS_PER_TOKEN);
    const percent = Math.round((usedTokens / MODEL_CONTEXT_LIMIT) * 100);
    return { used: usedTokens, limit: MODEL_CONTEXT_LIMIT, percent };
  }

  getConversation(): Message[] {
    return this.conversation;
  }

  setConversation(conversation: Message[]) {
    this.conversation = conversation;
  }

  clearConversation() {
    this.conversation = [];
  }

  async compact(): Promise<string> {
    this.conversation.push({
      role: "user",
      content: "Summarize our conversation so far in a concise paragraph. Focus on key decisions, code changes, and current state. This will replace the conversation history.",
    });

    let summary = "";
    for await (const chunk of this.provider.chat(this.conversation)) {
      if (chunk.type === "text" && chunk.text) {
        summary += chunk.text;
      }
    }

    this.conversation = [
      { role: "user", content: `[Conversation Summary]\n${summary}` },
      { role: "assistant", content: "Got it. I have the context from our previous conversation." },
    ];
    return summary;
  }

  async chat(userMessage: string, callbacks?: ChatCallbacks): Promise<string> {
    this.conversation.push({ role: "user", content: userMessage });
    Logger.debug("User message", userMessage);

    while (true) {
      this.spinner.start();
      Logger.llm("Starting generation");
      
      let text = "";
      const toolCalls: ToolCall[] = [];
      let firstChunk = true;

      try {
        for await (const chunk of this.provider.chat(this.conversation)) {
          if (firstChunk) {
            this.spinner.stop();
            firstChunk = false;
          }

          if (chunk.type === "text" && chunk.text) {
            if (callbacks?.onChunk) {
              callbacks.onChunk(chunk.text);
            } else {
              process.stdout.write(chunk.text);
            }
            text += chunk.text;
          }

          if (chunk.type === "tool_call" && chunk.toolCall) {
            Logger.llm("Tool call received", chunk.toolCall.name);
            toolCalls.push(chunk.toolCall);
          }
        }
      } catch (error) {
        this.spinner.stop();
        Logger.debug("LLM error", error);
        throw error;
      }

      if (toolCalls.length > 0) {
        this.conversation.push({ role: "assistant", toolCalls });

        for (const call of toolCalls) {
          const tool = this.tools.find((t) => t.name === call.name);
          if (!tool) {
            this.conversation.push({
              role: "tool",
              toolCallId: call.id,
              content: JSON.stringify({ error: `Unknown tool: ${call.name}` }),
            });
            callbacks?.onToolCall?.(call.name, false);
            continue;
          }

          try {
            Logger.tool(call.name, call.args, "executing...");
            const toolResult = await tool.execute(call.args);
            const response = typeof toolResult === "string" ? { output: toolResult } : toolResult;
            const success = !("error" in response);
            Logger.tool(call.name, call.args, response);
            if (callbacks?.onToolCall) {
              callbacks.onToolCall(call.name, success);
            } else {
              console.log(`\n[${call.name}] ${success ? "✓" : "✗"}`);
            }
            this.conversation.push({
              role: "tool",
              toolCallId: call.id,
              content: JSON.stringify(response),
            });
          } catch (error) {
            Logger.debug("Tool execution error", { tool: call.name, error: String(error) });
            callbacks?.onToolCall?.(call.name, false);
            this.conversation.push({
              role: "tool",
              toolCallId: call.id,
              content: JSON.stringify({ error: String(error) }),
            });
          }
        }

        continue;
      }

      if (text) {
        this.conversation.push({ role: "assistant", content: text });
        Logger.debug("Assistant response length", text.length);
        return text;
      }

      return "";
    }
  }

  restoreConversation(messages: Message[]) {
    this.conversation = messages;
  }
}
