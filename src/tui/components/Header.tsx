import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

interface HeaderProps {
  title?: string;
}

export function Header({ title = "Cove" }: HeaderProps) {
  return (
    <Box borderStyle="single" borderColor={theme.peach} paddingX={1} justifyContent="center">
      <Text color={theme.peach} bold>{title}</Text>
    </Box>
  );
}
