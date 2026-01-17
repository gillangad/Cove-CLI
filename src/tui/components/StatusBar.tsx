import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

interface StatusBarProps {
  model: string;
  contextPercent: number;
  variant?: string;
  isThinking?: boolean;
}

export function StatusBar({ model, contextPercent, variant, isThinking }: StatusBarProps) {
  const contextColor = contextPercent > 80 ? theme.error : contextPercent > 50 ? theme.warning : theme.success;
  
  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box>
        <Text color={theme.muted}>/help </Text>
        <Text color={theme.muted}>/sessions </Text>
        <Text color={theme.muted}>/compact </Text>
        <Text color={theme.muted}>/exit</Text>
      </Box>
      <Box>
        {variant && variant !== "default" && (
          <Text color={theme.ocean}>{variant} · </Text>
        )}
        <Text color={theme.muted}>{model} · </Text>
        <Text color={contextColor}>{contextPercent < 1 ? "<1" : contextPercent}%</Text>
        {isThinking && <Text color={theme.coral}> ●</Text>}
      </Box>
    </Box>
  );
}
