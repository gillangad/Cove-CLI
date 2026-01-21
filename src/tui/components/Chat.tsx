import React, { useState, useEffect, useMemo, memo } from "react";
import { Box, Text } from "ink";
import { theme, SPINNER_FRAMES } from "../theme";
import { Message } from "./Message";
import type { DiffInfo } from "../../core/tools/types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "thinking";
  content: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  toolArgsText?: string;
  success?: boolean;
  diff?: DiffInfo;
  isStreaming?: boolean;
}

interface ToolDraft {
  index: number;
  name?: string;
  argsText?: string;
}

interface ChatProps {
  messages: ChatMessage[];
  toolDrafts?: ToolDraft[];
  isThinking?: boolean;
  termRows?: number;
  termCols?: number;
  scrollOffset?: number;
}

// Reserved lines for UI elements (header, input, status bar, padding, safety margin)
const RESERVED_UI_LINES = 10;

// Estimate how many lines a message will take when rendered
function estimateMessageLines(msg: ChatMessage, cols: number): number {
  const effectiveCols = Math.max(cols - 4, 20); // Account for margins/padding
  
  if (msg.role === "tool") {
    // Tool messages are typically 1-2 lines + optional diff
    // Diff rendering is collapsed by default, so count as 1-2 lines
    return msg.diff && msg.diff.lines.length > 0 ? 3 : 1;
  }
  
  // For text content, estimate lines by wrapping
  const lines = msg.content.split("\n");
  let totalLines = 0;
  for (const line of lines) {
    totalLines += Math.max(1, Math.ceil(line.length / effectiveCols));
  }
  
  // Add 1 for role prefix / margin
  return Math.max(1, totalLines);
}

// Memoized thinking indicator to prevent re-renders from affecting parent
const ThinkingIndicator = memo(function ThinkingIndicator() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 160); // 160ms reduces flicker (was 80ms)
    return () => clearInterval(interval);
  }, []);

  return (
    <Box marginLeft={1}>
      <Text color={theme.warning}>{SPINNER_FRAMES[frame]}</Text>
      <Text color={theme.textMuted}> Working...</Text>
    </Box>
  );
});

export function Chat({ messages, toolDrafts, isThinking, termRows = 24, termCols = 80, scrollOffset = 0 }: ChatProps) {
  // Memoize derived state to avoid recalculating on every render
  const showWelcome = useMemo(() => messages.length === 0 && !isThinking, [messages.length, isThinking]);
  const showToolDrafts = useMemo(() => toolDrafts && toolDrafts.length > 0, [toolDrafts]);
  const showThinking = useMemo(() => isThinking && !showToolDrafts, [isThinking, showToolDrafts]);

  // Compute which messages to display (clip to fit viewport)
  const { visibleMessages, hiddenOlderCount, hiddenNewerCount } = useMemo(() => {
    const availableLines = Math.max(5, termRows - RESERVED_UI_LINES);

    // Clamp scroll offset and choose an end index to view.
    // scrollOffset=0 means "follow tail" (end of list).
    const clampedOffset = Math.max(0, Math.min(scrollOffset, Math.max(0, messages.length - 1)));
    const endExclusive = Math.max(0, messages.length - clampedOffset);

    // Work backwards from the end, including messages until we run out of space
    let usedLines = 0;
    let startIdx = endExclusive;

    for (let i = endExclusive - 1; i >= 0; i--) {
      const msgLines = estimateMessageLines(messages[i]!, termCols);
      if (usedLines + msgLines > availableLines && startIdx < endExclusive) {
        // We've run out of space and have at least one message
        break;
      }
      usedLines += msgLines;
      startIdx = i;
    }

    return {
      visibleMessages: messages.slice(startIdx, endExclusive),
      hiddenOlderCount: startIdx,
      hiddenNewerCount: clampedOffset,
    };
  }, [messages, termRows, termCols, scrollOffset]);

  // Memoize rendered messages to avoid recreating elements on unrelated state changes
  const renderedMessages = useMemo(() => 
    visibleMessages.map((msg) => (
      <Message key={msg.id} {...msg} />
    )), 
    [visibleMessages]
  );

  // Memoize tool drafts rendering
  const renderedToolDrafts = useMemo(() => 
    toolDrafts?.map((t) => (
      <Message
        key={`tool-draft-${t.index}`}
        role="tool"
        content={t.name || "tool"}
        toolName={t.name}
        toolArgsText={t.argsText}
      />
    )),
    [toolDrafts]
  );

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} marginY={1}>
      {/* Welcome message - always render Box for layout stability */}
      <Box flexDirection="column" marginLeft={1} display={showWelcome ? "flex" : "none"}>
        <Text color={theme.accent} bold>Cove</Text>
        <Text color={theme.textMuted}>Your coding companion</Text>
        <Text color={theme.textMuted} dimColor>
          Try: "Create a new React component"
        </Text>
      </Box>

      {/* Hidden messages indicator */}
      <Box display={hiddenOlderCount > 0 ? "flex" : "none"} marginLeft={1} marginBottom={1}>
        <Text color={theme.textMuted} dimColor>
          ... {hiddenOlderCount} earlier message{hiddenOlderCount !== 1 ? "s" : ""} hidden ...
        </Text>
      </Box>

      {/* Messages area - grows to fill available space */}
      <Box flexDirection="column" flexGrow={1}>
        {renderedMessages}
      </Box>

      {/* Newer messages indicator when scrolled up */}
      <Box display={hiddenNewerCount > 0 ? "flex" : "none"} marginLeft={1} marginTop={1}>
        <Text color={theme.textMuted} dimColor>
          ... {hiddenNewerCount} newer message{hiddenNewerCount !== 1 ? "s" : ""} hidden (↓ to return) ...
        </Text>
      </Box>

      {/* Fixed-height status area for tool drafts and thinking indicator */}
      {/* Always reserve 1 line height to prevent layout shift */}
      <Box flexDirection="column" minHeight={1}>
        {/* Tool drafts - always render Box for layout stability */}
        <Box flexDirection="column" marginLeft={1} display={showToolDrafts ? "flex" : "none"}>
          {renderedToolDrafts}
        </Box>

        {/* Thinking indicator - always render Box for layout stability */}
        <Box display={showThinking ? "flex" : "none"}>
          <ThinkingIndicator />
        </Box>
      </Box>
    </Box>
  );
}
