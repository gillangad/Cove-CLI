#!/usr/bin/env bun
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { loadEnv } from "../shared/config";
import { Agent } from "../core/agent";
import { shellManager } from "../shared/shell-manager";
import { loadVariant, listVariants } from "../shared/variants";
import { getTools } from "../core/tools/registry";
import { saveSession, loadSession, listSessions, deleteSession } from "../core/session";
import { listModelsByProvider, resolveModelId, type ProviderName } from "../core/llm/models";

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
  /models      - List curated models
  /provider X  - Set provider (glm|openai|anthropic|google)
  /model X     - Set model (short or provider/model)

Sessions:
  /sessions    - List saved sessions
  /save [name] - Save current session
  /load <id>   - Load a session
  /new         - Start new session (saves current)
  /delete <id> - Delete a session

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

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export async function runCLI(args: string[]) {
  const cmd = args[0];

  // Subcommands
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(WELCOME);
    console.log(HELP);
    process.exit(0);
  }

  if (cmd === "version" || cmd === "--version" || cmd === "-v") {
    console.log("Cove v0.1.0");
    process.exit(0);
  }

  if (cmd === "variants") {
    console.log("Available variants:", listVariants().join(", "));
    process.exit(0);
  }

  // Check if first arg is a variant name
  const variants = listVariants();
  const variantName = variants.includes(cmd ?? "") ? cmd : undefined;
  const variant = loadVariant(variantName);
  const tools = getTools(variant.tools);

  const callbacks = {
    onChunk: (text: string) => {
      stdout.write(text);
    },
    onToolCall: (name: string, _args: Record<string, unknown>, success: boolean) => {
      stdout.write("\n");
      console.log(`[${name}] ${success ? "✓" : "✗"}`);
    },
  };
  
  const createAgent = () => new Agent(tools, variant.prompt);

  // Non-interactive mode: cove [variant] run "prompt"
  const runIndex = args.indexOf("run");
  if (runIndex !== -1 && args[runIndex + 1]) {
    const agent = createAgent();
    const prompt = args.slice(runIndex + 1).join(" ");

    // Support slash commands in non-interactive mode for quick listings.
    if (prompt.trim() === "/models") {
      const grouped = listModelsByProvider();
      console.log("Models:");
      for (const [provider, models] of Object.entries(grouped)) {
        console.log(`\n${provider}:`);
        for (const m of models) {
          console.log(`  ${m.id}`);
        }
      }
      shellManager.killAll();
      process.exit(0);
    }

    await agent.chat(prompt, callbacks);
    shellManager.killAll();
    process.exit(0);
  }

  console.log(WELCOME);
  if (variantName) {
    console.log(`Variant: ${variantName}\n`);
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  let agent = createAgent();
  let currentSessionId: string | undefined;
  let providerScope: ProviderName = "glm";

  while (true) {
    const input = await rl.question("> ");
    const trimmed = input.trim();

    if (!trimmed) continue;

    if (trimmed === "/exit") {
      // Auto-save on exit if there's conversation
      if (agent.getConversation().length > 0) {
        saveSession(agent.getConversation(), {
          id: currentSessionId,
          variant: variantName,
          modelId: agent.getModelId(),
        });
      }
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
      const previousModelId = agent.getModelId();
      agent = createAgent();
      try {
        agent.setModel(previousModelId);
      } catch {
        // ignore
      }
      currentSessionId = undefined;
      console.log("Conversation cleared.");
      continue;
    }

    // Session commands
    if (trimmed === "/sessions") {
      const sessions = listSessions();
      if (sessions.length === 0) {
        console.log("No saved sessions.");
      } else {
        console.log("\n\x1B[1mSaved Sessions:\x1B[0m");
        console.log("─".repeat(70));
        for (const s of sessions.slice(0, 20)) {
          const active = s.id === currentSessionId ? "\x1B[32m●\x1B[0m " : "  ";
          const title = s.title.length > 40 ? s.title.slice(0, 37) + "..." : s.title.padEnd(40);
          console.log(`${active}\x1B[36m${s.id}\x1B[0m  ${title}  ${formatDate(s.updatedAt)}`);
        }
        if (sessions.length > 20) {
          console.log(`  ... and ${sessions.length - 20} more`);
        }
        console.log("");
      }
      continue;
    }

    if (trimmed.startsWith("/save")) {
      const customTitle = trimmed.slice(5).trim() || undefined;
      const session = saveSession(agent.getConversation(), {
        id: currentSessionId,
        title: customTitle,
        variant: variantName,
        modelId: agent.getModelId(),
      });
      currentSessionId = session.id;
      console.log(`Saved session: ${session.id} (${session.title})`);
      continue;
    }

    if (trimmed.startsWith("/load ")) {
      const id = trimmed.slice(6).trim();
      const session = loadSession(id);
      if (!session) {
        console.log(`Session ${id} not found.`);
      } else {
        agent = createAgent();
        agent.setConversation(session.conversation);
        currentSessionId = session.id;
        const maybeScope = (session.modelId?.split("/")[0] || "glm") as ProviderName;
        providerScope = maybeScope;
        if (session.modelId) {
          try {
            agent.setModel(session.modelId);
          } catch {
            // ignore
          }
        }
        console.log(`Loaded session: ${session.title}`);
        console.log(`Messages: ${session.conversation.length}`);
      }
      continue;
    }

    if (trimmed === "/new") {
      // Save current session if has content
      if (agent.getConversation().length > 0) {
        const session = saveSession(agent.getConversation(), {
          id: currentSessionId,
          variant: variantName,
          modelId: agent.getModelId(),
        });
        console.log(`Saved: ${session.id}`);
      }
      agent = createAgent();
      currentSessionId = undefined;
      console.log("Started new session.");
      continue;
    }

    if (trimmed === "/models") {
      const grouped = listModelsByProvider();
      console.log("\nModels:");
      for (const [provider, models] of Object.entries(grouped)) {
        console.log(`\n${provider}:`);
        for (const m of models) {
          console.log(`  ${m.id}`);
        }
      }
      console.log("");
      continue;
    }

    if (trimmed.startsWith("/provider ")) {
      const name = trimmed.slice(10).trim() as ProviderName;
      providerScope = name;
      try {
        agent.setProvider(name);
        console.log(`Provider set to ${name}. Model: ${agent.getModelId()}`);
      } catch (e) {
        console.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
      continue;
    }

    if (trimmed.startsWith("/model ")) {
      const arg = trimmed.slice(7).trim();
      const resolved = resolveModelId(arg, providerScope);
      if (!resolved) {
        console.log(`Unknown model: ${arg}`);
        continue;
      }
      try {
        agent.setModel(resolved);
        providerScope = agent.getModelId().split("/")[0] as ProviderName;
        console.log(`Model set to ${agent.getModelId()}`);
      } catch (e) {
        console.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
      continue;
    }

    if (trimmed.startsWith("/delete ")) {
      const id = trimmed.slice(8).trim();
      if (deleteSession(id)) {
        console.log(`Deleted session: ${id}`);
        if (id === currentSessionId) {
          currentSessionId = undefined;
        }
      } else {
        console.log(`Session ${id} not found.`);
      }
      continue;
    }

    if (trimmed.startsWith("!")) {
      const cmd = trimmed.slice(1).trim();
      if (cmd) {
        if (cmd.endsWith("&")) {
          const bgCmd = cmd.slice(0, -1).trim();
          const id = shellManager.spawn(bgCmd);
          console.log(`\x1B[36mStarted ${id}:\x1B[0m ${bgCmd}`);
        } else {
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

    await agent.chat(trimmed, callbacks);

    stdout.write("\n");
  }

  rl.close();
}
