import React, { useState, useEffect, useMemo } from "react";
import { Box, useInput, useApp } from "ink";
import { Header, Chat, Input, StatusBar } from "./components";
import { Sessions } from "./dialogs";
import { Agent } from "../core/agent";
import { getTools } from "../core/tools/registry";
import { loadVariant } from "../shared/variants";
import { loadSession, type SessionMetadata } from "../core/session";
import { shellManager } from "../shared/shell-manager";
import { Logger } from "../shared/Logger";
import { CommandHistory } from "../shared/CommandHistory";

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
  const [verboseMode, setVerboseMode] = useState(false);
  
  // Command history (session-only, not persistent)
  const commandHistory = useMemo(() => new CommandHistory(), []);

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
        content: "Commands:\n/exit - Exit Cove\n/clear - Clear conversation\n/help - Show this help\n/context - Show context usage\n/compact - Compress context\n/verbose - Toggle verbose mode\n/sessions - Manage sessions\n/bashes - List background shells\n!<cmd> - Run shell command\n!<cmd> & - Run in background"
      }]);
      return;
    }

    if (trimmed === "/verbose") {
      const enabled = Logger.toggle();
      setVerboseMode(enabled);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Verbose mode ${enabled ? "enabled" : "disabled"}`
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

    // Handle shell commands (!cmd)
    if (trimmed.startsWith("!")) {
      const cmd = trimmed.slice(1).trim();
      if (cmd) {
        setMessages(prev => [...prev, { role: "user", content: trimmed }]);
        
        if (cmd.endsWith("&")) {
          // Background process
          const bgCmd = cmd.slice(0, -1).trim();
          const id = shellManager.spawn(bgCmd);
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `Started background shell ${id}: ${bgCmd}` 
          }]);
        } else {
          // Foreground process
          setIsThinking(true);
          try {
            const proc = Bun.spawn(["bash", "-c", cmd], {
              cwd: process.cwd(),
              stdout: "pipe",
              stderr: "pipe",
            });
            const [stdout, stderr] = await Promise.all([
              new Response(proc.stdout).text(),
              new Response(proc.stderr).text(),
            ]);
            await proc.exited;
            const output = (stdout + stderr).trim() || "(no output)";
            setMessages(prev => [...prev, { role: "assistant", content: output }]);
          } catch (error) {
            setMessages(prev => [...prev, { 
              role: "assistant", 
              content: `Error: ${error instanceof Error ? error.message : String(error)}` 
            }]);
          } finally {
            setIsThinking(false);
          }
        }
      }
      return;
    }

    // Handle /bashes command
    if (trimmed === "/bashes") {
      const shells = shellManager.list();
      if (shells.length === 0) {
        setMessages(prev => [...prev, { role: "assistant", content: "No background shells." }]);
      } else {
        const lines = shells.map(s => {
          const status = s.running ? "● running" : `○ exited (${s.exitCode})`;
          return `${s.id}: ${status} ${s.runtime} - ${s.command}`;
        });
        setMessages(prev => [...prev, { role: "assistant", content: "Background Shells:\n" + lines.join("\n") }]);
      }
      return;
    }

    // Handle /output <id> command
    if (trimmed.startsWith("/output ")) {
      const id = trimmed.slice(8).trim();
      const output = shellManager.getOutput(id, 30);
      if (!output) {
        setMessages(prev => [...prev, { role: "assistant", content: `Shell ${id} not found.` }]);
      } else {
        const lines: string[] = [];
        if (output.stdout.length > 0) {
          lines.push("stdout:", ...output.stdout);
        }
        if (output.stderr.length > 0) {
          lines.push("stderr:", ...output.stderr);
        }
        if (lines.length === 0) {
          lines.push("No output yet.");
        }
        setMessages(prev => [...prev, { role: "assistant", content: lines.join("\n") }]);
      }
      return;
    }

    // Handle /kill <id> command
    if (trimmed.startsWith("/kill ")) {
      const id = trimmed.slice(6).trim();
      if (shellManager.kill(id)) {
        setMessages(prev => [...prev, { role: "assistant", content: `Killed ${id}` }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: `Shell ${id} not found.` }]);
      }
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
            history={commandHistory}
          />
          <StatusBar
            model="glm-4.7"
            contextPercent={contextPercent}
            isThinking={isThinking}
            verbose={verboseMode}
          />
        </>
      )}
    </Box>
  );
}
