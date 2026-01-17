import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme";
import { listSessions, type SessionMetadata } from "../../core/session";

interface SessionsProps {
  onSelect: (session: SessionMetadata) => void;
  onClose: () => void;
}

export function Sessions({ onSelect, onClose }: SessionsProps) {
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSessions(listSessions());
  }, []);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onClose();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(sessions.length - 1, prev + 1));
      return;
    }

    if (key.return && sessions.length > 0) {
      onSelect(sessions[selectedIndex]);
      return;
    }
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.peach}
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text color={theme.peach} bold>Sessions</Text>
      </Box>

      {sessions.length === 0 ? (
        <Box>
          <Text color={theme.muted}>No saved sessions</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {sessions.slice(0, 10).map((session, i) => (
            <Box key={session.id}>
              <Text
                color={i === selectedIndex ? theme.coral : undefined}
                inverse={i === selectedIndex}
              >
                {" "}
                {session.title.slice(0, 40).padEnd(40)}
                {"  "}
                <Text color={theme.muted}>{formatDate(session.updatedAt)}</Text>
                {"  "}
                <Text color={theme.ocean}>{session.variant}</Text>
              </Text>
            </Box>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={theme.muted}>↑/↓ navigate • Enter select • Esc close</Text>
      </Box>
    </Box>
  );
}
