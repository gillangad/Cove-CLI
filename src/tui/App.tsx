import React, { useState, useEffect } from "react";
import { Box, useInput, useApp } from "ink";
import { Header, Chat, Input, StatusBar } from "./components";
import { Sessions } from "./dialogs";
import { Agent } from "../core/agent";
import { getTools } from "../core/tools/registry";
import { loadVariant } from "../shared/variants";
import { loadSession, type SessionMetadata } from "../core/session";

interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  success?: boolean;
}

export function App() {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [agent, setAgent] = useState<Agent | null>(null);
  const [contextPercent, setContextPercent] = useState(0);
  const [showSessions, setShowSessions] = useState(false);

  // Initialize agent (env is already loaded in index.tsx)
  useEffect(() => {
    const variant = loadVariant();
    const tools = getTools(variant.tools);
    const newAgent = new Agent(tools, variant.prompt);
    setAgent(newAgent);
  }, []);

  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === "c") {
      exit();
    }
  });

  const handleSubmit = async (value: string) => {
    if (!value.trim() || !agent || isThinking) return;

    const trimmed = value.trim();
    setInput("");

    // Handle slash commands
    if (trimmed === "/exit" || trimmed === "/q") {
      exit();
      return;
    }

    if (trimmed === "/clear") {
      setMessages([]);
      const variant = loadVariant();
      const tools = getTools(variant.tools);
      setAgent(new Agent(tools, variant.prompt));
      setContextPercent(0);
      return;
    }

    if (trimmed === "/help") {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Commands:\n/exit - Exit Cove\n/clear - Clear conversation\n/help - Show this help\n/context - Show context usage\n/compact - Compress context"
      }]);
      return;
    }

    if (trimmed === "/context") {
      const { used, limit, percent } = agent.getContextUsage();
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Context: ${percent}% (${Math.round(used/1000)}K / ${Math.round(limit/1000000)}M tokens)`
      }]);
      return;
    }

    if (trimmed === "/sessions") {
      setShowSessions(true);
      return;
    }

    // Add user message
    setMessages(prev => [...prev, { role: "user", content: trimmed }]);
    setIsThinking(true);
    setStreamingText("");

    try {
      const response = await agent.chat(trimmed, {
        onChunk: (chunk) => setStreamingText(prev => prev + chunk),
        onToolCall: (name, success) => {
          setMessages(prev => [...prev, {
            role: "tool",
            content: name,
            toolName: name,
            success
          }]);
        }
      });
      setMessages(prev => [...prev, { role: "assistant", content: response }]);
      const { percent } = agent.getContextUsage();
      setContextPercent(percent);
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: `Error: ${error instanceof Error ? error.message : String(error)}` 
      }]);
    } finally {
      setIsThinking(false);
      setStreamingText("");
    }
  };

  const handleSessionSelect = (session: SessionMetadata) => {
    const loaded = loadSession(session.id);
    if (loaded && agent) {
      const variant = loadVariant();
      const tools = getTools(variant.tools);
      const newAgent = new Agent(tools, variant.prompt);
      newAgent.restoreConversation(loaded.conversation);
      setAgent(newAgent);
      setMessages(loaded.conversation.map(m => ({
        role: m.role,
        content: m.content || ""
      })));
    }
    setShowSessions(false);
  };

  return (
    <Box flexDirection="column" height="100%">
      {showSessions && (
        <Sessions 
          onSelect={handleSessionSelect}
          onClose={() => setShowSessions(false)}
        />
      )}
      {!showSessions && (
        <>
          <Header />
          <Chat 
            messages={messages} 
            streamingText={streamingText}
            isThinking={isThinking} 
          />
          <Input
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            disabled={isThinking}
          />
          <StatusBar
            model="glm-4.7"
            contextPercent={contextPercent}
            isThinking={isThinking}
          />
        </>
      )}
    </Box>
  );
}
