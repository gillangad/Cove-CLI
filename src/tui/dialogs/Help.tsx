import React from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme";

interface HelpDialogProps {
  onClose: () => void;
}

export function HelpDialog({ onClose }: HelpDialogProps) {
  useInput((input, key) => {
    if (key.escape || input === "q") {
      onClose();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.peach}
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text color={theme.peach} bold>Help - Cove Commands</Text>
      </Box>
      
      <Box marginBottom={1} flexDirection="column">
        <Text bold color={theme.coral}>General</Text>
        <Text>  /help     - Show this help</Text>
        <Text>  /exit     - Exit Cove</Text>
        <Text>  /clear    - Clear conversation</Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text bold color={theme.coral}>Context</Text>
        <Text>  /context  - Show context usage</Text>
        <Text>  /compact  - Compress context</Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text bold color={theme.coral}>Sessions</Text>
        <Text>  /sessions - List saved sessions</Text>
        <Text>  /save     - Save current session</Text>
        <Text>  /load id  - Load a session</Text>
        <Text>  /new      - Start new session</Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text bold color={theme.coral}>Shell</Text>
        <Text>  !cmd      - Run shell command</Text>
        <Text>  !cmd &    - Run in background</Text>
        <Text>  /bashes   - List background shells</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={theme.muted}>Press Esc or q to close</Text>
      </Box>
    </Box>
  );
}
