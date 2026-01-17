import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

interface MessageProps {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  success?: boolean;
}

export function Message({ role, content, toolName, success }: MessageProps) {
  if (role === "tool") {
    return (
      <Box marginBottom={1}>
        <Text color={success ? theme.success : theme.error}>
          [{toolName}] {success ? "✓" : "✗"}
        </Text>
      </Box>
    );
  }

  if (role === "user") {
    return (
      <Box marginBottom={1}>
        <Text>
          <Text color={theme.coral} bold>You: </Text>
          <Text>{content}</Text>
        </Text>
      </Box>
    );
  }

  // assistant
  return (
    <Box marginBottom={1} flexDirection="column">
      <Text>
        <Text color={theme.peach} bold>Cove: </Text>
        <Text>{content}</Text>
      </Text>
    </Box>
  );
}
