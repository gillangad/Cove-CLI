import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme";

export type ConfirmChoice = "confirm" | "cancel" | "always";

interface ConfirmDialogProps {
  message: string;
  command?: string;
  onChoice: (choice: ConfirmChoice) => void;
  showAlways?: boolean;
}

export function ConfirmDialog({ message, command, onChoice, showAlways = true }: ConfirmDialogProps) {
  const [selected, setSelected] = useState(0);
  const options: { label: string; value: ConfirmChoice }[] = [
    { label: "Confirm", value: "confirm" },
    { label: "Cancel", value: "cancel" },
  ];
  
  if (showAlways) {
    options.push({ label: "Always Allow", value: "always" });
  }

  useInput(
    (input, key) => {
    if (key.leftArrow) {
      setSelected(prev => Math.max(0, prev - 1));
    } else if (key.rightArrow) {
      setSelected(prev => Math.min(options.length - 1, prev + 1));
    } else if (key.return) {
      onChoice(options[selected].value);
    } else if (key.escape || input === "n") {
      onChoice("cancel");
    } else if (input === "y") {
      onChoice("confirm");
    } else if (input === "a" && showAlways) {
      onChoice("always");
    }
    },
    { isActive: true }
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.warning}
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text color={theme.warning} bold>Confirmation Required</Text>
      </Box>
      
      <Text>{message}</Text>
      
      {command && (
        <Box marginTop={1}>
          <Text color={theme.muted}>Command: </Text>
          <Text color={theme.accent}>{command}</Text>
        </Box>
      )}
      
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
          y=confirm, n=cancel{showAlways ? ", a=always" : ""}, ←→=select, Enter=choose
        </Text>
      </Box>
    </Box>
  );
}
