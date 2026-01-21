import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

interface StatusBarProps {
  model: string;
  contextPercent: number;
  variant?: string;
  isThinking?: boolean;
  verbose?: boolean;
}

export function StatusBar({ model, contextPercent, variant, isThinking, verbose }: StatusBarProps) {
  const contextColor =
    contextPercent > 80 ? theme.error :
    contextPercent > 50 ? theme.warning :
    theme.success;

  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box>
        <Text color={theme.muted}>/help </Text>
        <Text color={theme.muted}>/sessions </Text>
        <Text color={theme.muted}>/models </Text>
        <Text color={theme.muted}>/compact </Text>
        <Text color={theme.muted}>/exit</Text>
      </Box>
      <Box>
        {verbose && (
          <Text color={theme.warning}>VERBOSE · </Text>
        )}
        {variant && variant !== "default" && (
          <Text color={theme.textSecondary}>{variant} · </Text>
        )}
        <Text color={theme.muted}>{model} · </Text>
        <Text color={contextColor}>{contextPercent < 1 ? "<1" : contextPercent}%</Text>
        {isThinking && <Text color={theme.warning}> ●</Text>}
      </Box>
    </Box>
  );
}
