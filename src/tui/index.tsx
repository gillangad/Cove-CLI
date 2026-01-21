#!/usr/bin/env bun
import React from "react";
import { render } from "ink";
import { loadEnv } from "../shared/config";
import { App } from "./App"; 

export function runTUI() {
  // Load env BEFORE rendering the app
  loadEnv();

  // Ink needs a real TTY (raw mode) for interactive input.
  // In non-TTY environments (e.g. running under some shells/pipes), Ink throws.
  // Fall back to a clear error so users can switch to CLI mode.
  try {
    const tty = require("tty") as { isatty: (fd: number) => boolean };
    if (!tty.isatty(0)) {
      console.error("TUI unavailable: stdin is not a TTY. Try running in a real terminal, or use: cove --cli");
      process.exit(1);
    }
  } catch {
    // If tty isn't available for some reason, just try to render.
  }

  render(<App />, {
    // Lower FPS reduces flicker from frequent re-renders
    maxFps: 30,
    // Incremental rendering: only update changed lines (reduces flicker)
    incrementalRendering: true,
  });
}
