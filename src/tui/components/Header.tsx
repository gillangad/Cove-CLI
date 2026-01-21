import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

interface HeaderProps {
  title?: string;
}

export function Header({ title = "Cove" }: HeaderProps) {
  return (
    <Box paddingX={1} borderStyle="single" borderColor={theme.muted}>
      <Text color={theme.accent} bold>{title}</Text>
    </Box>
  );
}
