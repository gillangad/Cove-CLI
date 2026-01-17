#!/usr/bin/env bun
import { loadEnv } from "./shared/config";

// Load env FIRST before anything else
loadEnv();

const args = process.argv.slice(2);

// Route to CLI or TUI based on args
// --cli or "run" command uses CLI, otherwise use TUI
if (args.includes("--cli") || args.includes("run") || args.includes("--help") || args.includes("-h") || args.includes("--version") || args.includes("-v") || args.includes("help") || args.includes("version") || args.includes("variants")) {
  // Use CLI for these modes
  import("./cli/index").then(({ runCLI }) => runCLI(args)).catch(console.error);
} else {
  // Default to TUI
  import("./tui/index").then(({ runTUI }) => runTUI()).catch(console.error);
}
