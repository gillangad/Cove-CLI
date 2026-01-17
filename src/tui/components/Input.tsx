import React from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { theme } from "../theme";
import type { CommandHistory } from "../../shared/CommandHistory";

interface InputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled?: boolean;
  history?: CommandHistory;
}

export function Input({ value, onChange, onSubmit, disabled, history }: InputProps) {
  // Handle arrow keys for history navigation
  useInput((input, key) => {
    if (disabled || !history) return;
    
    if (key.upArrow) {
      const prev = history.getPrevious();
      if (prev !== null) {
        onChange(prev);
      }
    } else if (key.downArrow) {
      const next = history.getNext();
      if (next !== null) {
        onChange(next);
      }
    }
  });

  const handleSubmit = (val: string) => {
    if (history && val.trim()) {
      history.add(val);
    }
    onSubmit(val);
  };

  return (
    <Box borderStyle="single" borderColor={theme.muted} paddingX={1}>
      <Text color={theme.coral}>&gt; </Text>
      {disabled ? (
        <Text color={theme.muted}>Thinking...</Text>
      ) : (
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={handleSubmit}
          placeholder="Type a message..."
        />
      )}
    </Box>
  );
}
