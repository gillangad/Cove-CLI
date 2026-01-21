import React from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { theme } from "../theme";
import type { CommandHistory } from "../../shared/CommandHistory";

export interface SlashCommandItem {
  cmd: string;
  description: string;
  insert?: string;
}

interface InputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled?: boolean;
  history?: CommandHistory;
  slashCommands?: SlashCommandItem[];
}

export function Input({ value, onChange, onSubmit, disabled, history, slashCommands }: InputProps) {
  const isSlashMode = value.startsWith("/");
  const firstToken = value.split(/\s+/)[0] ?? "";
  const showMenu = isSlashMode && !value.includes(" ");

  const filtered = React.useMemo(() => {
    if (!showMenu || !slashCommands || slashCommands.length === 0) return [];
    const prefix = firstToken;
    return slashCommands
      .filter((c) => c.cmd.startsWith(prefix))
      .slice(0, 8);
  }, [showMenu, slashCommands, firstToken]);

  const [selectedIndex, setSelectedIndex] = React.useState(0);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [firstToken]);

  const applySelection = () => {
    const item = filtered[selectedIndex];
    if (!item) return;

    const rest = value.includes(" ") ? value.slice(value.indexOf(" ") + 1) : "";
    const insert = item.insert ?? item.cmd;

    // Replace the first token, preserving any existing args.
    if (!rest) {
      onChange(insert);
      return;
    }

    if (insert.endsWith(" ")) {
      onChange(`${insert}${rest}`);
    } else {
      onChange(`${insert} ${rest}`);
    }
  };

  useInput(
    (input, key) => {
    if (disabled) return;

    if (showMenu && filtered.length > 0) {
      if (key.upArrow) {
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (key.tab) {
        applySelection();
        return;
      }
      // Enter selects from the menu when we're still typing the command name.
      if (key.return && !value.includes(" ")) {
        applySelection();
        return;
      }
    }

    if (!history) return;

    // Command history: readline-style bindings (so arrows can be used for chat scrollback)
    if (key.ctrl && input === "p") {
      const prev = history.getPrevious();
      if (prev !== null) onChange(prev);
      return;
    }

    if (key.ctrl && input === "n") {
      const next = history.getNext();
      if (next !== null) onChange(next);
      return;
    }
    },
    { isActive: true }
  );

  const handleSubmit = (val: string) => {
    if (history && val.trim()) {
      history.add(val);
    }
    onSubmit(val);
  };

  // Always render menu container for layout stability
  const showMenuVisible = showMenu && filtered.length > 0 && !disabled;

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle={showMenuVisible ? "single" : undefined}
        borderColor={theme.muted}
        paddingX={showMenuVisible ? 1 : 0}
        marginBottom={showMenuVisible ? 1 : 0}
        display={showMenuVisible ? "flex" : "none"}
      >
        {filtered.map((item, idx) => {
          const selected = idx === selectedIndex;
          return (
            <Box key={`${item.cmd}-${idx}`}>
              <Text
                color={selected ? theme.accent : theme.textSecondary}
                backgroundColor={selected ? theme.bgTertiary : undefined}
                bold={selected}
              >
                {item.cmd.padEnd(10)}
              </Text>
              <Text color={selected ? theme.text : theme.textMuted}>
                {selected ? " " : " "}
                {item.description}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box borderStyle="single" borderColor={theme.muted} paddingX={1}>
        <Text color={theme.accent} bold>&gt; </Text>
        {disabled ? (
          <Text color={theme.textMuted}>Working...</Text>
        ) : (
          <TextInput
            value={value}
            onChange={onChange}
            onSubmit={handleSubmit}
            placeholder="Enter a command..."
          />
        )}
      </Box>
    </Box>
  );
}
