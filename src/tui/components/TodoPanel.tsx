import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { TodoItem, TodoStatus } from "../../core/tools/todo";

interface TodoPanelProps {
  todos: TodoItem[];
  isThinking: boolean;
}

function getStatusIcon(status: TodoStatus): string {
  switch (status) {
    case "pending":
      return "○";
    case "in_progress":
      return "◐";
    case "completed":
      return "●";
    case "cancelled":
      return "✗";
    default:
      return "?";
  }
}

function getStatusColor(status: TodoStatus): string {
  switch (status) {
    case "pending":
      return theme.textMuted;
    case "in_progress":
      return theme.warning;
    case "completed":
      return theme.success;
    case "cancelled":
      return theme.error;
    default:
      return theme.text;
  }
}

function getPriorityBadge(priority: string): string {
  switch (priority) {
    case "high":
      return "!";
    case "medium":
      return "";
    case "low":
      return "";
    default:
      return "";
  }
}

export function TodoPanel({ todos, isThinking }: TodoPanelProps) {
  // Only show when there are active (non-completed) todos and the agent is working
  const activeTodos = todos.filter(
    (t) => t.status === "pending" || t.status === "in_progress"
  );

  // Show max 5 todos to avoid taking too much screen space
  const displayTodos = todos.slice(0, 5);
  const hasMore = todos.length > 5;

  // Determine visibility - always render container for layout stability
  const shouldShow = activeTodos.length > 0 && isThinking;

  return (
    <Box
      flexDirection="column"
      borderStyle={shouldShow ? "single" : undefined}
      borderColor={theme.muted}
      paddingX={shouldShow ? 1 : 0}
      marginX={shouldShow ? 1 : 0}
      marginBottom={shouldShow ? 1 : 0}
      display={shouldShow ? "flex" : "none"}
    >
      <Box marginBottom={0}>
        <Text color={theme.accent} bold>
          Tasks
        </Text>
        <Text color={theme.textMuted}> ({activeTodos.length} active)</Text>
      </Box>

      {displayTodos.map((todo) => (
        <Box key={todo.id}>
          <Text color={getStatusColor(todo.status)}>{getStatusIcon(todo.status)} </Text>
          {todo.priority === "high" && (
            <Text color={theme.error} bold>
              !{" "}
            </Text>
          )}
          <Text
            color={
              todo.status === "completed"
                ? theme.textMuted
                : todo.status === "in_progress"
                ? theme.text
                : theme.textSecondary
            }
            strikethrough={todo.status === "completed" || todo.status === "cancelled"}
          >
            {todo.content.length > 60
              ? todo.content.slice(0, 57) + "..."
              : todo.content}
          </Text>
        </Box>
      ))}

      {hasMore && (
        <Text color={theme.textMuted}>... and {todos.length - 5} more</Text>
      )}
    </Box>
  );
}
