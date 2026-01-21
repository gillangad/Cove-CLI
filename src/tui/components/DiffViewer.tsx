import React, { useState } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { DiffInfo, DiffLine } from "../../core/tools/types";

const COLLAPSE_THRESHOLD = 10;
const VISIBLE_LINES_WHEN_COLLAPSED = 6; // 3 from start, 3 from end

interface DiffViewerProps {
  diff: DiffInfo;
}

function DiffLineView({ line }: { line: DiffLine }) {
  const prefix = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
  const color = line.type === "added" 
    ? theme.success 
    : line.type === "removed" 
      ? theme.error 
      : theme.textMuted;
  
  // Format line number (pad to 4 chars)
  const lineNum = line.type === "removed" 
    ? line.oldLineNumber 
    : line.newLineNumber;
  const lineNumStr = lineNum ? String(lineNum).padStart(4, " ") : "    ";
  
  return (
    <Box>
      <Text color={theme.textMuted}>{lineNumStr} </Text>
      <Text color={color}>{prefix}</Text>
      <Text color={color}> {line.content}</Text>
    </Box>
  );
}

export function DiffViewer({ diff }: DiffViewerProps) {
  const [expanded, setExpanded] = useState(false);
  
  const shouldCollapse = diff.lines.length > COLLAPSE_THRESHOLD;
  const isCollapsed = shouldCollapse && !expanded;
  
  let visibleLines: DiffLine[];
  let hiddenCount = 0;
  
  if (isCollapsed) {
    const half = Math.floor(VISIBLE_LINES_WHEN_COLLAPSED / 2);
    const startLines = diff.lines.slice(0, half);
    const endLines = diff.lines.slice(-half);
    visibleLines = startLines;
    hiddenCount = diff.lines.length - VISIBLE_LINES_WHEN_COLLAPSED;
    visibleLines = [...startLines, ...endLines];
  } else {
    visibleLines = diff.lines;
  }
  
  if (diff.lines.length === 0) {
    return null;
  }
  
  return (
    <Box flexDirection="column" marginLeft={2}>
      {isCollapsed ? (
        <>
          {visibleLines.slice(0, VISIBLE_LINES_WHEN_COLLAPSED / 2).map((line, i) => (
            <DiffLineView
              key={`start-${line.type}-${line.oldLineNumber ?? "_"}-${line.newLineNumber ?? "_"}-${i}`}
              line={line}
            />
          ))}
          <Box marginY={0}>
            <Text color={theme.textMuted}>     ...</Text>
            <Text color={theme.warning}> [{hiddenCount} lines hidden]</Text>
          </Box>
          {visibleLines.slice(VISIBLE_LINES_WHEN_COLLAPSED / 2).map((line, i) => (
            <DiffLineView
              key={`end-${line.type}-${line.oldLineNumber ?? "_"}-${line.newLineNumber ?? "_"}-${i}`}
              line={line}
            />
          ))}
        </>
      ) : (
        visibleLines.map((line, i) => (
          <DiffLineView key={`${line.type}-${line.oldLineNumber ?? "_"}-${line.newLineNumber ?? "_"}-${i}`} line={line} />
        ))
      )}
    </Box>
  );
}
