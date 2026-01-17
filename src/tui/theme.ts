// Peach Beachy Theme for Cove TUI
export const theme = {
  // Primary colors
  peach: "#FFCCBC",
  coral: "#FFAB91",
  ocean: "#B2EBF2",
  teal: "#4DD0E1",
  sand: "#FFE0B2",
  shell: "#FFF8E1",
  driftwood: "#8D6E63",

  // Semantic colors
  primary: "#FFCCBC",    // peach
  accent: "#FFAB91",     // coral
  success: "#4DD0E1",    // teal
  warning: "#FFE0B2",    // sand
  error: "#EF5350",      // red
  muted: "#8D6E63",      // driftwood
  
  // Text
  text: "#FFFFFF",
  textMuted: "#8D6E63",
  textHighlight: "#FFCCBC",
} as const;

export type Theme = typeof theme;
