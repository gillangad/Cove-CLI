import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import { Message } from "./Message";

interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  success?: boolean;
}

interface ChatProps {
  messages: ChatMessage[];
  streamingText?: string;
  isThinking?: boolean;
}

export function Chat({ messages, streamingText, isThinking }: ChatProps) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} marginY={1}>
      {messages.length === 0 && (
        <Box>
          <Text color={theme.muted}>Start a conversation...</Text>
        </Box>
      )}
      
      {messages.map((msg, i) => (
        <Message key={i} {...msg} />
      ))}
      
      {isThinking && (
        <Box>
          <Text color={theme.ocean}>
            {streamingText || "▰▱▱▱▱ Thinking..."}
          </Text>
        </Box>
      )}
    </Box>
  );
}
