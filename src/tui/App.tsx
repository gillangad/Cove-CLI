import React, { useState, useEffect, useMemo, useRef } from "react";
import { Box, useInput, useApp, useStdout } from "ink";
import { Header, Chat, Input, StatusBar, MessagePager } from "./components";
import { TodoPanel } from "./components/TodoPanel";
import { Sessions } from "./dialogs";
import { Agent, AbortError } from "../core/agent";
import { getTools } from "../core/tools/registry";
import { loadVariant } from "../shared/variants";
import { loadSession, type SessionMetadata } from "../core/session";
import { shellManager } from "../shared/shell-manager";
import { Logger } from "../shared/Logger";
import { CommandHistory } from "../shared/CommandHistory";
import type { DiffInfo } from "../core/tools/types";
import { listModelsByProvider, resolveModelId, type ProviderName } from "../core/llm/models";
import { setTodosChangeCallback, getTodos, clearTodos, type TodoItem } from "../core/tools/todo";

const SLASH_COMMANDS = [
  { cmd: "/help", description: "Show commands" },
  { cmd: "/models", description: "List curated models" },
  { cmd: "/provider", description: "Switch provider", insert: "/provider " },
  { cmd: "/model", description: "Switch model", insert: "/model " },
  { cmd: "/sessions", description: "Open sessions" },
  { cmd: "/context", description: "Show context usage" },
  { cmd: "/compact", description: "Summarize and compress" },
  { cmd: "/verify", description: "Run verification", insert: "/verify " },
  { cmd: "/verbose", description: "Toggle verbose mode" },
  { cmd: "/bashes", description: "List background shells" },
  { cmd: "/output", description: "Show shell output", insert: "/output " },
  { cmd: "/kill", description: "Kill background shell", insert: "/kill " },
  { cmd: "/clear", description: "Clear conversation" },
  { cmd: "/exit", description: "Exit Cove" },
] as const;

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "thinking";
  content: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  toolArgsText?: string;
  success?: boolean;
  diff?: DiffInfo;
  isStreaming?: boolean; // Whether this message is still being streamed
}

interface ToolDraft {
  index: number;
  id?: string;
  name?: string;
  argsText?: string;
}

export function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [toolDrafts, setToolDrafts] = useState<ToolDraft[]>([]);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [contextPercent, setContextPercent] = useState(0);
  const [showSessions, setShowSessions] = useState(false);
  const [verboseMode, setVerboseMode] = useState(false);
  const [modelId, setModelId] = useState<string>("glm/glm-4.7");
  const [providerScope, setProviderScope] = useState<ProviderName>("glm");
  const [todos, setTodos] = useState<TodoItem[]>([]);

  // Chat scrollback (messages). 0 means "follow tail".
  const [scrollOffset, setScrollOffset] = useState(0);

  // Fullscreen pager for a single message (line-level scroll)
  const [pagerMessageIndex, setPagerMessageIndex] = useState<number | null>(null);

  // Keep scroll offset within bounds as messages change.
  useEffect(() => {
    setScrollOffset((prev) => Math.max(0, Math.min(prev, Math.max(0, messages.length - 1))));
  }, [messages.length]);
  
  // Terminal dimensions for viewport-aware rendering
  const [termRows, setTermRows] = useState(() => stdout?.rows ?? 24);
  const [termCols, setTermCols] = useState(() => stdout?.columns ?? 80);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);

  // Streaming batching: avoid rerendering Ink per token.
  // NEW: We no longer stream assistant/thinking text into the UI.
  // Instead we buffer and render once per block.
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingAssistantTextRef = useRef<string>("");
  const pendingThinkingTextRef = useRef<string>("");
  const pendingToolDraftsRef = useRef<Map<number, { index: number; name?: string; argsText?: string; fullArgsText?: string }>>(new Map());
  const messageIdCounterRef = useRef(0);
  // Track if thinking has been flushed this turn (to avoid double-flush)
  const thinkingFlushedRef = useRef<boolean>(false);

  const lastVerifyCommandRef = useRef<string>("");

  const commandHistory = useMemo(() => new CommandHistory(), []);

  const newMessageId = () => `m_${Date.now().toString(36)}_${(messageIdCounterRef.current++).toString(36)}`;

  const stopFlushLoop = () => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  };

  const startFlushLoop = () => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setInterval(() => {
      const draftsMap = pendingToolDraftsRef.current;

      // Only flush tool drafts now - thinking/assistant are flushed once as blocks
      if (draftsMap.size === 0) return;

      // Flush tool drafts with preview-only argsText
      const nextDrafts = Array.from(draftsMap.values())
        .sort((a, b) => a.index - b.index)
        .map(d => ({
          index: d.index,
          name: d.name,
          // Only include truncated preview in state (full args kept in map)
          argsText: d.argsText,
        }));
      setToolDrafts(nextDrafts);
    }, 100); // 100ms reduces flicker
  };

  useEffect(() => {
    const variant = loadVariant();
    const tools = getTools(variant.tools);
    const newAgent = new Agent(tools, variant.prompt);
    setAgent(newAgent);
    setModelId(newAgent.getModelId());
    setProviderScope(newAgent.getModelId().split("/")[0] as ProviderName);
    
    // Set up todo change callback
    setTodosChangeCallback((newTodos) => {
      setTodos(newTodos);
    });
    
    // Load existing todos
    setTodos(getTodos());
    
    return () => {
      setTodosChangeCallback(null);
    };
  }, []);

  useEffect(() => {
    return () => {
      stopFlushLoop();
    };
  }, []);

  // Track terminal resize events
  useEffect(() => {
    if (!stdout) return;
    const handleResize = () => {
      setTermRows(stdout.rows ?? 24);
      setTermCols(stdout.columns ?? 80);
    };
    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout]);

  useInput(
    (inputChar, key) => {
    if (key.ctrl && inputChar === "c") {
      exit();
    }
    if (key.escape && isThinking && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (showSessions) return;
    if (pagerMessageIndex !== null) return;

    // Scrollback is only available when the model is not generating.
    // This avoids Ink flicker caused by scrolling while content is changing.
    if (!isThinking) {
      const slashMenuOpen = input.startsWith("/") && !input.includes(" ");

      if (key.ctrl && inputChar === "o") {
        if (slashMenuOpen) return;
        // Open pager for the bottom-most visible message (usually the thing you're reading).
        const clampedOffset = Math.max(0, Math.min(scrollOffset, Math.max(0, messages.length - 1)));
        const endExclusive = Math.max(0, messages.length - clampedOffset);
        const candidate = endExclusive - 1;
        if (candidate >= 0) setPagerMessageIndex(candidate);
        return;
      }

      if (key.upArrow) {
        if (slashMenuOpen) return;
        setScrollOffset((prev) => prev + 1);
        return;
      }
      if (key.downArrow) {
        if (slashMenuOpen) return;
        setScrollOffset((prev) => Math.max(0, prev - 1));
        return;
      }

      // Half-page scroll (readline-style)
      if (key.ctrl && inputChar === "u") {
        if (slashMenuOpen) return;
        const step = Math.max(1, Math.floor((termRows - 10) / 2));
        setScrollOffset((prev) => prev + step);
        return;
      }
      if (key.ctrl && inputChar === "d") {
        if (slashMenuOpen) return;
        const step = Math.max(1, Math.floor((termRows - 10) / 2));
        setScrollOffset((prev) => Math.max(0, prev - step));
        return;
      }
    }
    },
    // In some environments (certain Bun/terminal combos), raw mode isn't available.
    // Disable input handling in that case to avoid Ink throwing.
    { isActive: true }
  );

  const handleSubmit = async (value: string) => {
    if (!value.trim() || !agent || isThinking) return;

    const trimmed = value.trim();
    setInput("");

    if (trimmed === "/exit" || trimmed === "/q") {
      exit();
      return;
    }

    if (trimmed === "/clear") {
      setMessages([]);
      const variant = loadVariant();
      const tools = getTools(variant.tools);
      const newAgent = new Agent(tools, variant.prompt, modelId);
      setAgent(newAgent);
      setModelId(newAgent.getModelId());
      setProviderScope(newAgent.getModelId().split("/")[0] as ProviderName);
      setToolDrafts([]);
      setContextPercent(0);
      clearTodos(); // Clear todos on conversation reset

      pendingAssistantTextRef.current = "";
      pendingToolDraftsRef.current.clear();
      assistantMessageIdRef.current = null;
      stopFlushLoop();
      return;
    }

    if (trimmed === "/help") {
      setMessages(prev => [...prev, {
        id: newMessageId(),
        role: "assistant",
        content: "Commands:\n/exit - Exit Cove\n/clear - Clear conversation\n/help - Show this help\n/context - Show context usage\n/compact - Compress context\n/verify <cmd> - Run verification command\n/verbose - Toggle verbose mode\n/sessions - Manage sessions\n/models - List curated models\n/provider <name> - Set provider (glm|openai|anthropic|google)\n/model <id|short> - Set model\n/bashes - List background shells\n/output <id> - Show output from a background shell\n/kill <id> - Kill a background shell\n\nShell shortcuts:\n!<cmd> - Run shell command\n!<cmd> & - Run in background\n\nKeyboard shortcuts:\n↑/↓ - Scroll chat history (when idle)\nCtrl+U / Ctrl+D - Scroll faster\nCtrl+P / Ctrl+N - Previous/next input history\nCtrl+O - Open message pager (line scroll)\nEsc - Cancel response / close pager"
      }]);
      return;
    }

    if (trimmed === "/models") {
      const grouped = listModelsByProvider();
      const lines: string[] = ["Models:"];
      for (const [provider, models] of Object.entries(grouped)) {
        lines.push("", `${provider}:`);
        for (const m of models) lines.push(`  ${m.id}`);
      }
      setMessages(prev => [...prev, { id: newMessageId(), role: "assistant", content: lines.join("\n") }]);
      return;
    }

    if (trimmed.startsWith("/provider ")) {
      const name = trimmed.slice(10).trim() as ProviderName;
      try {
        agent.setProvider(name);
        setProviderScope(name);
        setModelId(agent.getModelId());
        setMessages(prev => [...prev, { id: newMessageId(), role: "assistant", content: `Provider set to ${name}. Model: ${agent.getModelId()}` }]);
      } catch (e) {
        setMessages(prev => [...prev, { id: newMessageId(), role: "assistant", content: `Error: ${e instanceof Error ? e.message : String(e)}` }]);
      }
      return;
    }

    if (trimmed.startsWith("/model ")) {
      const arg = trimmed.slice(7).trim();
      const resolved = resolveModelId(arg, providerScope);
      if (!resolved) {
        setMessages(prev => [...prev, { id: newMessageId(), role: "assistant", content: `Unknown model: ${arg}` }]);
        return;
      }
      try {
        agent.setModel(resolved);
        setModelId(agent.getModelId());
        setProviderScope(agent.getModelId().split("/")[0] as ProviderName);
        setMessages(prev => [...prev, { id: newMessageId(), role: "assistant", content: `Model set to ${agent.getModelId()}` }]);
      } catch (e) {
        setMessages(prev => [...prev, { id: newMessageId(), role: "assistant", content: `Error: ${e instanceof Error ? e.message : String(e)}` }]);
      }
      return;
    }

    if (trimmed === "/verbose") {
      const enabled = Logger.toggle();
      setVerboseMode(enabled);
      setMessages(prev => [...prev, {
        id: newMessageId(),
        role: "assistant",
        content: `Verbose mode ${enabled ? "enabled" : "disabled"}`
      }]);
      return;
    }

    if (trimmed === "/context") {
      const { used, limit, percent } = agent.getContextUsage();
      setMessages(prev => [...prev, {
        id: newMessageId(),
        role: "assistant",
        content: `Context: ${percent}% (${Math.round(used/1000)}K / ${Math.round(limit/1000000)}M tokens)`
      }]);
      return;
    }

    if (trimmed === "/sessions") {
      setShowSessions(true);
      return;
    }

    // Verify: user-triggered only. Runs via the bash tool (Pi-like: first-class tool run).
    if (trimmed.startsWith("/verify")) {
      const cmdArg = trimmed.slice("/verify".length).trim();
      const cmd = cmdArg || lastVerifyCommandRef.current;
      if (!cmd) {
        setMessages((prev) => [
          ...prev,
          {
            id: newMessageId(),
            role: "assistant",
            content: "Usage: /verify <command> (example: /verify bun run typecheck)",
          },
        ]);
        return;
      }

      lastVerifyCommandRef.current = cmd;

      // Show the user's command in the chat.
      setMessages((prev) => [...prev, { id: newMessageId(), role: "user", content: trimmed }]);
      setIsThinking(true);
      setToolDrafts([]);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        // Directly execute the bash tool without going through the LLM.
        const tool = getTools(loadVariant().tools).find((t) => t.name === "bash");
        if (!tool) throw new Error("bash tool not available");
        const res = await tool.execute({ command: cmd });
        const response = typeof res === "string" ? { output: res } : res;
        const success = !(response && typeof response === "object" && "error" in response && (response as any).error);
        const diff = response && typeof response === "object" && "diff" in response ? (response as any).diff : undefined;

        setMessages((prev) => [
          ...prev,
          {
            id: newMessageId(),
            role: "tool",
            content: "bash",
            toolName: "bash",
            toolParams: { command: cmd },
            success,
            diff,
          },
          {
            id: newMessageId(),
            role: "assistant",
            content: typeof response === "object" && "output" in response ? String((response as any).output ?? "") : JSON.stringify(response),
          },
        ]);
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: newMessageId(),
            role: "assistant",
            content: `Verify error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ]);
      } finally {
        setIsThinking(false);
        abortControllerRef.current = null;
      }

      return;
    }

    if (trimmed.startsWith("!")) {
      const cmd = trimmed.slice(1).trim();
      if (cmd) {
        setMessages(prev => [...prev, { id: newMessageId(), role: "user", content: trimmed }]);
        
        if (cmd.endsWith("&")) {
          const bgCmd = cmd.slice(0, -1).trim();
          const id = shellManager.spawn(bgCmd);
          setMessages(prev => [...prev, { 
            id: newMessageId(),
            role: "assistant", 
            content: `Started background shell ${id}: ${bgCmd}` 
          }]);
        } else {
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
            setMessages(prev => [...prev, { id: newMessageId(), role: "assistant", content: output }]);
          } catch (error) {
            setMessages(prev => [...prev, { 
              id: newMessageId(),
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

    if (trimmed === "/bashes") {
      const shells = shellManager.list();
      if (shells.length === 0) {
        setMessages(prev => [...prev, { id: newMessageId(), role: "assistant", content: "No background shells." }]);
      } else {
        const lines = shells.map(s => {
          const status = s.running ? "● running" : `○ exited (${s.exitCode})`;
          return `${s.id}: ${status} ${s.runtime} - ${s.command}`;
        });
        setMessages(prev => [...prev, { id: newMessageId(), role: "assistant", content: "Background Shells:\n" + lines.join("\n") }]);
      }
      return;
    }

    if (trimmed.startsWith("/output ")) {
      const id = trimmed.slice(8).trim();
      const output = shellManager.getOutput(id, 30);
      if (!output) {
        setMessages(prev => [...prev, { id: newMessageId(), role: "assistant", content: `Shell ${id} not found.` }]);
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
        setMessages(prev => [...prev, { id: newMessageId(), role: "assistant", content: lines.join("\n") }]);
      }
      return;
    }

    if (trimmed.startsWith("/kill ")) {
      const id = trimmed.slice(6).trim();
      if (shellManager.kill(id)) {
        setMessages(prev => [...prev, { id: newMessageId(), role: "assistant", content: `Killed ${id}` }]);
      } else {
        setMessages(prev => [...prev, { id: newMessageId(), role: "assistant", content: `Shell ${id} not found.` }]);
      }
      return;
    }

    // New turn: reset streaming buffers + start flush loop.
    setScrollOffset(0);
    setPagerMessageIndex(null);
    pendingAssistantTextRef.current = "";
    pendingThinkingTextRef.current = "";
    pendingToolDraftsRef.current.clear();
    assistantMessageIdRef.current = null;
    thinkingFlushedRef.current = false;

    const userId = newMessageId();

    setMessages(prev => [...prev, { id: userId, role: "user", content: trimmed }]);
    setIsThinking(true);
    setToolDrafts([]);
    startFlushLoop();
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Helper: flush thinking text as a single block (called once per turn)
    const flushThinkingOnce = () => {
      if (thinkingFlushedRef.current) return;
      const thinkingText = pendingThinkingTextRef.current.trim();
      if (thinkingText) {
        setMessages(prev => [...prev, { id: newMessageId(), role: "thinking", content: thinkingText }]);
      }
      pendingThinkingTextRef.current = "";
      thinkingFlushedRef.current = true;
    };

    // Helper: flush assistant text as a single block
    const flushAssistantText = () => {
      const assistantText = pendingAssistantTextRef.current.trim();
      if (assistantText) {
        setMessages(prev => [...prev, { id: newMessageId(), role: "assistant", content: assistantText }]);
      }
      pendingAssistantTextRef.current = "";
    };

    // Helper: compute preview for tool args (truncate to ~80 chars)
    const computeArgsPreview = (argsText: string): string => {
      const compact = argsText.replace(/\s+/g, " ").trim();
      return compact.length > 80 ? compact.slice(0, 77) + "..." : compact;
    };

    try {
      await agent.chat(trimmed, {
        onThinking: (chunk) => {
          // Just buffer - no setMessages during streaming
          pendingThinkingTextRef.current += chunk;
        },
        onChunk: (chunk) => {
          // Just buffer - no setMessages during streaming
          pendingAssistantTextRef.current += chunk;
        },
        onTextComplete: () => {
          // Flush thinking first (if not already flushed)
          flushThinkingOnce();
          // Flush assistant text as one block
          flushAssistantText();
        },
        onToolCallDelta: (delta) => {
          // Flush thinking before showing tool drafts
          flushThinkingOnce();
          
          const map = pendingToolDraftsRef.current;
          const existing = map.get(delta.index);
          
          // Accumulate full args text
          const fullArgsText = (existing?.fullArgsText ?? "") + (delta.argsText ?? "");
          
          map.set(delta.index, {
            index: delta.index,
            name: delta.name ?? existing?.name,
            // Store preview for rendering, full text for later
            argsText: computeArgsPreview(fullArgsText),
            fullArgsText: fullArgsText,
          });
        },
        onToolCall: (name, args, success, diff) => {
          // Flush thinking before showing tool result
          flushThinkingOnce();
          
          // Once tools are finalized, hide the draft section.
          setToolDrafts([]);
          pendingToolDraftsRef.current.clear();
          setMessages(prev => [...prev, {
            id: newMessageId(),
            role: "tool",
            content: name,
            toolName: name,
            toolParams: args,
            success,
            diff
          }]);
        }
      }, controller.signal);
      
      // Final flush of any remaining text (e.g. if provider didn't call onTextComplete)
      flushThinkingOnce();
      flushAssistantText();
      
      setModelId(agent.getModelId());
      setProviderScope(agent.getModelId().split("/")[0] as ProviderName);
      const { percent } = agent.getContextUsage();
      setContextPercent(percent);
    } catch (error) {
      // Flush any accumulated text before showing error
      flushThinkingOnce();
      if (pendingAssistantTextRef.current.trim()) {
        flushAssistantText();
      }
      
      if (error instanceof AbortError) {
        // Add cancellation message
        setMessages(prev => [...prev, { id: newMessageId(), role: "assistant", content: "[Response cancelled]" }]);
      } else {
        setMessages(prev => [...prev, { 
          id: newMessageId(),
          role: "assistant", 
          content: `Error: ${error instanceof Error ? error.message : String(error)}` 
        }]);
      }
    } finally {
      setIsThinking(false);
      // Once generation completes, default to follow-tail.
      // (User can immediately scroll up with arrows.)
      setScrollOffset(0);
      setToolDrafts([]);
      pendingToolDraftsRef.current.clear();
      pendingAssistantTextRef.current = "";
      pendingThinkingTextRef.current = "";
      thinkingFlushedRef.current = false;
      stopFlushLoop();
      assistantMessageIdRef.current = null;
      abortControllerRef.current = null;
    }
  };

  const handleSessionSelect = (session: SessionMetadata) => {
    const loaded = loadSession(session.id);
    if (loaded && agent) {
      const variant = loadVariant();
      const tools = getTools(variant.tools);
      const newAgent = new Agent(tools, variant.prompt, loaded.modelId);
      newAgent.restoreConversation(loaded.conversation);
      try {
        newAgent.setModel(loaded.modelId);
      } catch {
        // ignore
      }
      setAgent(newAgent);
      setModelId(newAgent.getModelId());
      setProviderScope(newAgent.getModelId().split("/")[0] as ProviderName);
      setMessages(loaded.conversation.map(m => ({
        id: newMessageId(),
        role: m.role === "system" ? "assistant" : m.role,
        content: m.content || ""
      })));
      setScrollOffset(0);
      setPagerMessageIndex(null);
    }
    setShowSessions(false);
  };

  return (
    <Box flexDirection="column" height={Math.max(1, termRows - 1)}>
      {showSessions && (
        <Sessions 
          onSelect={handleSessionSelect}
          onClose={() => setShowSessions(false)}
        />
      )}
      {!showSessions && pagerMessageIndex !== null && (
        <MessagePager
          title="Message"
          content={messages[pagerMessageIndex]?.content ?? ""}
          termRows={termRows}
          termCols={termCols}
          onClose={() => setPagerMessageIndex(null)}
        />
      )}

      {!showSessions && pagerMessageIndex === null && (
        <>
          <Header />
          <TodoPanel todos={todos} isThinking={isThinking} />
          <Chat 
            messages={messages} 
            toolDrafts={toolDrafts}
            isThinking={isThinking}
            termRows={termRows}
            termCols={termCols}
            scrollOffset={scrollOffset}
          />
          <Input
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            disabled={isThinking}
            history={commandHistory}
            slashCommands={SLASH_COMMANDS as any}
          />
          <StatusBar
            model={modelId}
            contextPercent={contextPercent}
            isThinking={isThinking}
            verbose={verboseMode}
          />
        </>
      )}
    </Box>
  );
}
