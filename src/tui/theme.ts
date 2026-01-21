// Brutalist dark theme for Cove TUI - matches WeaveML style
export const theme = {
  // Background tones (can't set in terminal, but for reference)
  bgPrimary: "#0a0a0a",
  bgSecondary: "#141414",
  bgTertiary: "#1e1e1e",

  // Text colors
  text: "#e0e0e0",
  textMuted: "#606060",
  textSecondary: "#a0a0a0",

  // Semantic colors
  accent: "#ffffff",
  success: "#00ff00",
  error: "#ff3333",
  warning: "#ffcc00",

  // Aliases for components
  primary: "#ffffff",
  muted: "#606060",
} as const;

export type Theme = typeof theme;

// Spinner frames for tool call animations
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
