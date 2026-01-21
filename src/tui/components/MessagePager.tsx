import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme";

function wrapTextToLines(text: string, cols: number): string[] {
  const maxCols = Math.max(20, cols - 4);
  const out: string[] = [];

  for (const rawLine of text.split("\n")) {
    if (rawLine.length === 0) {
      out.push("");
      continue;
    }

    let line = rawLine;
    while (line.length > maxCols) {
      out.push(line.slice(0, maxCols));
      line = line.slice(maxCols);
    }
    out.push(line);
  }

  return out;
}

interface MessagePagerProps {
  title: string;
  content: string;
  termRows: number;
  termCols: number;
  onClose: () => void;
}

export function MessagePager({ title, content, termRows, termCols, onClose }: MessagePagerProps) {
  const lines = useMemo(() => wrapTextToLines(content, termCols), [content, termCols]);

  // Border + header + footer take a few lines.
  const availableLines = Math.max(5, termRows - 6);
  const maxOffset = Math.max(0, lines.length - availableLines);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setOffset((prev) => Math.max(0, Math.min(prev, maxOffset)));
  }, [maxOffset]);

  useInput(
    (input, key) => {
      if (key.escape || (key.ctrl && input === "o")) {
        onClose();
        return;
      }

      if (key.upArrow) {
        setOffset((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow) {
        setOffset((prev) => Math.min(maxOffset, prev + 1));
        return;
      }

      if (key.ctrl && input === "u") {
        const step = Math.max(1, Math.floor(availableLines / 2));
        setOffset((prev) => Math.max(0, prev - step));
        return;
      }

      if (key.ctrl && input === "d") {
        const step = Math.max(1, Math.floor(availableLines / 2));
        setOffset((prev) => Math.min(maxOffset, prev + step));
        return;
      }

      if (input === "g") {
        setOffset(0);
        return;
      }

      if (input === "G") {
        setOffset(maxOffset);
        return;
      }
    },
    { isActive: true }
  );

  const windowLines = lines.slice(offset, offset + availableLines);
  const posLabel = lines.length <= 1 ? "" : ` ${offset + 1}-${Math.min(lines.length, offset + availableLines)}/${lines.length}`;

  return (
    <Box flexDirection="column" height={Math.max(1, termRows - 1)} paddingX={1} paddingY={1}>
      <Box borderStyle="double" borderColor={theme.accent} flexDirection="column" paddingX={1} paddingY={0}>
        <Box justifyContent="space-between">
          <Text color={theme.accent} bold>
            {title}
          </Text>
          <Text color={theme.textMuted}>
            {posLabel}
          </Text>
        </Box>

        <Box flexDirection="column" marginTop={1} marginBottom={1}>
          {windowLines.map((l, i) => (
            <Text key={`line-${offset + i}`}>{l}</Text>
          ))}
        </Box>

        <Box justifyContent="space-between">
          <Text color={theme.textMuted}>↑/↓ scroll · Ctrl+U/D faster · g/G top/bottom</Text>
          <Text color={theme.textMuted}>Esc or Ctrl+O close</Text>
        </Box>
      </Box>
    </Box>
  );
}
