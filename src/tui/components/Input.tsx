import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { theme } from "../theme";

interface InputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled?: boolean;
}

export function Input({ value, onChange, onSubmit, disabled }: InputProps) {
  return (
    <Box borderStyle="single" borderColor={theme.muted} paddingX={1}>
      <Text color={theme.coral}>&gt; </Text>
      {disabled ? (
        <Text color={theme.muted}>Thinking...</Text>
      ) : (
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder="Type a message..."
        />
      )}
    </Box>
  );
}
