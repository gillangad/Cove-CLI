import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme";

export type RetryChoice = "retry" | "skip" | "abort";

interface RetryDialogProps {
  toolName: string;
  errorMessage: string;
  attempt: number;
  onChoice: (choice: RetryChoice) => void;
}

export function RetryDialog({ toolName, errorMessage, attempt, onChoice }: RetryDialogProps) {
  const [selected, setSelected] = useState(0);
  const options: { label: string; value: RetryChoice }[] = [
    { label: "Retry", value: "retry" },
    { label: "Skip", value: "skip" },
    { label: "Abort", value: "abort" },
  ];

  useInput(
    (input, key) => {
    if (key.leftArrow) {
      setSelected(prev => Math.max(0, prev - 1));
    } else if (key.rightArrow) {
      setSelected(prev => Math.min(options.length - 1, prev + 1));
    } else if (key.return) {
      onChoice(options[selected].value);
    } else if (input === "r") {
      onChoice("retry");
    } else if (input === "s") {
      onChoice("skip");
    } else if (input === "a" || key.escape) {
      onChoice("abort");
    }
    },
    { isActive: true }
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.error}
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text color={theme.error} bold>Tool Error - Retry?</Text>
      </Box>
      
      <Box marginBottom={1}>
        <Text color={theme.muted}>Tool: </Text>
        <Text color={theme.accent}>{toolName}</Text>
        <Text color={theme.muted}> (attempt {attempt})</Text>
      </Box>
      
      <Box marginBottom={1}>
        <Text wrap="wrap">{errorMessage.slice(0, 200)}</Text>
      </Box>
      
      <Box marginTop={1} gap={2}>
        {options.map((opt, i) => (
          <Text
            key={opt.value}
            color={i === selected ? theme.accent : theme.muted}
            bold={i === selected}
          >
            {i === selected ? `[${opt.label}]` : ` ${opt.label} `}
          </Text>
        ))}
      </Box>
      
      <Box marginTop={1}>
        <Text color={theme.muted}>
          r=retry, s=skip, a=abort, ←→=select, Enter=choose
        </Text>
      </Box>
    </Box>
  );
}
