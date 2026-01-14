import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Agent } from "./agent";

const WELCOME = `
╭──────────────────────────╮
│          Cove            │
│    Coding Agent v0.1     │
╰──────────────────────────╯
`;

const HELP = `
Commands:
  /exit   - Exit the agent
  /help   - Show this help
  /clear  - Reset conversation
`;

async function main() {
  console.log(WELCOME);

  const rl = readline.createInterface({ input: stdin, output: stdout });
  let agent = new Agent();

  while (true) {
    const input = await rl.question("> ");
    const trimmed = input.trim();

    if (!trimmed) continue;

    if (trimmed === "/exit") {
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

    await agent.chat(trimmed);

    stdout.write("\n");
  }

  rl.close();
}

main().catch(console.error);
