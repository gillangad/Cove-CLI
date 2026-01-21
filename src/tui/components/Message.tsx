import React, { useState, useEffect, memo } from "react";
import { Box, Text } from "ink";
import { theme, SPINNER_FRAMES } from "../theme";
import { DiffViewer } from "./DiffViewer";
import type { DiffInfo } from "../../core/tools/types";

interface MessageProps {
  role: "user" | "assistant" | "tool" | "thinking";
  content: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  toolArgsText?: string;
  success?: boolean;
  diff?: DiffInfo;
  isStreaming?: boolean;
}

function formatArgsSnippet(argsText?: string): string {
  if (!argsText) return "";
  const compact = argsText.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length > 80 ? compact.slice(0, 77) + "..." : compact;
}

// Memoized Spinner to isolate animation state from parent
const Spinner = memo(function Spinner() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 160); // 160ms reduces flicker (was 80ms)
    return () => clearInterval(interval);
  }, []);

  return <Text color={theme.warning}>{SPINNER_FRAMES[frame]}</Text>;
});

function formatToolCall(name: string, params?: Record<string, unknown>): string {
  if (!params) return name;

  switch (name) {
    case "read":
      return `Read ${params.path}`;
    case "edit":
      return `Edit ${params.path}`;
    case "write":
      return `Write ${params.path}`;
    case "glob":
      return `Glob ${params.pattern}`;
    case "grep":
      return `Grep "${params.pattern}" ${params.path || "."}`;
    case "bash": {
      const cmd = params.command as string;
      return `$ ${cmd?.length > 50 ? cmd.slice(0, 50) + "..." : cmd}`;
    }
    case "list_dir":
      return `ls ${params.path || "."}`;
    default: {
      const firstParam = Object.entries(params).find(([k]) =>
        ["path", "pattern", "command", "query", "url"].includes(k)
      );
      if (firstParam) {
        const val = String(firstParam[1]);
        return `${name} ${val.length > 40 ? val.slice(0, 40) + "..." : val}`;
      }
      return name;
    }
  }
}

// Memoized Message component to prevent re-renders when parent state changes
export const Message = memo(function Message({ role, content, toolName, toolParams, toolArgsText, success, diff, isStreaming }: MessageProps) {
  if (role === "thinking") {
    return (
      <Box marginLeft={1} flexDirection="column">
        <Box>
          <Text color={theme.textMuted} dimColor>💭 </Text>
          <Text color={theme.textMuted} dimColor italic>{content || "Thinking..."}</Text>
        </Box>
      </Box>
    );
  }

  if (role === "tool") {
    const baseText = formatToolCall(toolName || content, toolParams);
    const argsSnippet = !toolParams ? formatArgsSnippet(toolArgsText) : "";
    const displayText = argsSnippet ? `${baseText} ${argsSnippet}` : baseText;

    if (success === undefined) {
      return (
        <Box marginLeft={1}>
          <Spinner />
          <Text color={theme.textMuted}> {displayText}</Text>
        </Box>
      );
    }

    // Show diff for edit operations
    const showDiff = toolName === "edit" && diff && diff.lines.length > 0;

    return (
      <Box marginLeft={1} flexDirection="column">
        <Box>
          <Text color={success ? theme.success : theme.error}>
            {success ? "●" : "✗"}
          </Text>
          <Text color={theme.textSecondary}> {displayText}</Text>
        </Box>
        {showDiff && <DiffViewer diff={diff} />}
      </Box>
    );
  }

  if (role === "user") {
    return (
      <Box>
        <Text color={theme.accent} bold>&gt;</Text>
        <Text> {content}</Text>
      </Box>
    );
  }

  return (
    <Box marginLeft={1} flexDirection="column">
      <Text color={theme.textSecondary}>{content}</Text>
    </Box>
  );
});
