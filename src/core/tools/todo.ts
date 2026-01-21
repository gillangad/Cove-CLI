import type { Tool, ToolInput } from "./types";

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type TodoPriority = "high" | "medium" | "low";

export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
  priority: TodoPriority;
}

// In-memory todo storage (per session)
let todos: TodoItem[] = [];

// Callback for TUI updates
let onTodosChange: ((todos: TodoItem[]) => void) | null = null;

/**
 * Set a callback to be notified when todos change
 */
export function setTodosChangeCallback(callback: ((todos: TodoItem[]) => void) | null) {
  onTodosChange = callback;
}

/**
 * Get current todos (for direct access from TUI)
 */
export function getTodos(): TodoItem[] {
  return [...todos];
}

/**
 * Clear all todos (for session reset)
 */
export function clearTodos(): void {
  todos = [];
  onTodosChange?.([]);
}

function notifyChange() {
  onTodosChange?.([...todos]);
}

export const todoTool: Tool = {
  name: "todo",
  description: `Manage a task list to plan and track work. Actions:
- "read": Get current todo list
- "write": Replace the entire todo list with a new list
- "update": Update a single todo item by id

Use this to break down complex tasks, show progress to the user, and track what needs to be done.`,
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["read", "write", "update"],
        description: "Action to perform: read, write, or update",
      },
      todos: {
        type: "array",
        description: "For 'write': The complete list of todos to set",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique identifier" },
            content: { type: "string", description: "Task description" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "cancelled"],
              description: "Task status",
            },
            priority: {
              type: "string",
              enum: ["high", "medium", "low"],
              description: "Task priority",
            },
          },
          required: ["id", "content", "status", "priority"],
        },
      },
      id: {
        type: "string",
        description: "For 'update': The id of the todo to update",
      },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "completed", "cancelled"],
        description: "For 'update': New status for the todo",
      },
    },
    required: ["action"],
  },
  async execute(input: ToolInput) {
    const { action, todos: newTodos, id, status } = input as {
      action: "read" | "write" | "update";
      todos?: TodoItem[];
      id?: string;
      status?: TodoStatus;
    };

    switch (action) {
      case "read": {
        return {
          todos: [...todos],
          summary: formatTodoSummary(),
        };
      }

      case "write": {
        if (!newTodos || !Array.isArray(newTodos)) {
          return { error: "todos array is required for write action" };
        }

        // Validate todos
        for (const todo of newTodos) {
          if (!todo.id || !todo.content || !todo.status || !todo.priority) {
            return { error: "Each todo must have id, content, status, and priority" };
          }
        }

        todos = newTodos;
        notifyChange();

        return {
          success: true,
          count: todos.length,
          summary: formatTodoSummary(),
        };
      }

      case "update": {
        if (!id) {
          return { error: "id is required for update action" };
        }

        const index = todos.findIndex((t) => t.id === id);
        if (index === -1) {
          return { error: `Todo with id "${id}" not found` };
        }

        if (status) {
          todos[index] = { ...todos[index], status };
        }

        notifyChange();

        return {
          success: true,
          updated: todos[index],
          summary: formatTodoSummary(),
        };
      }

      default:
        return { error: `Unknown action: ${action}` };
    }
  },
};

function formatTodoSummary(): string {
  if (todos.length === 0) {
    return "No todos";
  }

  const pending = todos.filter((t) => t.status === "pending").length;
  const inProgress = todos.filter((t) => t.status === "in_progress").length;
  const completed = todos.filter((t) => t.status === "completed").length;
  const cancelled = todos.filter((t) => t.status === "cancelled").length;

  const parts: string[] = [];
  if (inProgress > 0) parts.push(`${inProgress} in progress`);
  if (pending > 0) parts.push(`${pending} pending`);
  if (completed > 0) parts.push(`${completed} completed`);
  if (cancelled > 0) parts.push(`${cancelled} cancelled`);

  return `${todos.length} todos: ${parts.join(", ")}`;
}

/**
 * Format todos for display
 */
export function formatTodos(items: TodoItem[] = todos): string {
  if (items.length === 0) return "No todos";

  const lines: string[] = [];

  for (const todo of items) {
    const icon = getStatusIcon(todo.status);
    const priorityBadge = todo.priority === "high" ? "(!)" : todo.priority === "low" ? "" : "";
    lines.push(`${icon} ${priorityBadge}${todo.content}`);
  }

  return lines.join("\n");
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
