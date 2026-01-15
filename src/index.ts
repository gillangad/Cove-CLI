#!/usr/bin/env bun
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { loadEnv } from "./config";
import { Agent } from "./agent";
import { shellManager } from "./shell-manager";

// Load .env from ~/.cove/.env or cwd/.env
loadEnv();

const WELCOME = `
╭──────────────────────────╮
│          Cove            │
│    Coding Agent v0.1     │
╰──────────────────────────╯
`;

const HELP = `
Commands:
  /exit        - Exit the agent
  /help        - Show this help
  /clear       - Reset conversation
  /compact     - Summarize and compress context
  /context     - Show context window usage

Shell:
  !<cmd>       - Run shell command (blocking)
  !<cmd> &     - Run in background, returns ID
  /bashes      - List background shells
  /output <id> - Show output from shell
  /kill <id>   - Kill a background shell
`;

function renderContextBar(percent: number): string {
  const width = 20;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const color = percent > 80 ? "\x1B[31m" : percent > 50 ? "\x1B[33m" : "\x1B[32m";
  return `${color}[${"█".repeat(filled)}${"░".repeat(empty)}]\x1B[0m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

async function main() {
  console.log(WELCOME);

  const rl = readline.createInterface({ input: stdin, output: stdout });
  let agent = new Agent();

  while (true) {
    const input = await rl.question("> ");
    const trimmed = input.trim();

    if (!trimmed) continue;

    if (trimmed === "/exit") {
      const killed = shellManager.killAll();
      if (killed > 0) {
        console.log(`Killed ${killed} background shell(s).`);
      }
      console.log("Goodbye!");
      break;
    }

    if (trimmed === "/help") {
      console.log(HELP);
      continue;
    }

    if (trimmed === "/clear") {
      agent = new Agent();
      console.log("Conversation cleared.");
      continue;
    }

    if (trimmed.startsWith("!")) {
      const cmd = trimmed.slice(1).trim();
      if (cmd) {
        // Background execution with &
        if (cmd.endsWith("&")) {
          const bgCmd = cmd.slice(0, -1).trim();
          const id = shellManager.spawn(bgCmd);
          console.log(`\x1B[36mStarted ${id}:\x1B[0m ${bgCmd}`);
        } else {
          // Blocking execution
          const proc = Bun.spawn(["bash", "-c", cmd], {
            cwd: process.cwd(),
            stdout: "inherit",
            stderr: "inherit",
          });
          await proc.exited;
        }
      }
      continue;
    }

    if (trimmed === "/bashes") {
      const shells = shellManager.list();
      if (shells.length === 0) {
        console.log("No background shells.");
      } else {
        console.log("\n\x1B[1mBackground Shells:\x1B[0m");
        console.log("─".repeat(60));
        for (const s of shells) {
          const status = s.running
            ? "\x1B[32m●\x1B[0m running"
            : `\x1B[31m●\x1B[0m exited (${s.exitCode})`;
          console.log(`  \x1B[36m${s.id}\x1B[0m  ${status}  ${s.runtime}  ${s.command}`);
        }
        console.log("");
      }
      continue;
    }

    if (trimmed.startsWith("/output ")) {
      const id = trimmed.slice(8).trim();
      const output = shellManager.getOutput(id, 30);
      if (!output) {
        console.log(`Shell ${id} not found.`);
      } else {
        if (output.stdout.length > 0) {
          console.log("\n\x1B[1mstdout:\x1B[0m");
          output.stdout.forEach((line) => console.log(`  ${line}`));
        }
        if (output.stderr.length > 0) {
          console.log("\n\x1B[1mstderr:\x1B[0m");
          output.stderr.forEach((line) => console.log(`  \x1B[31m${line}\x1B[0m`));
        }
        if (output.stdout.length === 0 && output.stderr.length === 0) {
          console.log("No output yet.");
        }
        console.log("");
      }
      continue;
    }

    if (trimmed.startsWith("/kill ")) {
      const id = trimmed.slice(6).trim();
      if (shellManager.kill(id)) {
        console.log(`Killed ${id}`);
      } else {
        console.log(`Shell ${id} not found.`);
      }
      continue;
    }

    if (trimmed === "/compact") {
      console.log("Compacting conversation...");
      const summary = await agent.compact();
      const { percent } = agent.getContextUsage();
      console.log(`\nSummary: ${summary}\n`);
      console.log(`Context reduced to ${percent}%`);
      continue;
    }

    if (trimmed === "/context") {
      const { used, limit, percent } = agent.getContextUsage();
      const bar = renderContextBar(percent);
      const percentDisplay = percent < 1 ? "<1" : String(percent);
      console.log(`Context: ${bar} ${percentDisplay}% (${formatTokens(used)}/${formatTokens(limit)})`);
      continue;
    }

    await agent.chat(trimmed);

    stdout.write("\n");
  }

  rl.close();
}

main().catch(console.error);
