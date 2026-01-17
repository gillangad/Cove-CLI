import type { Tool, ToolInput } from "./types";
import { SANDBOX_DIR } from "../../shared/config";

const MAX_OUTPUT = 30 * 1024;
const HALF = 15 * 1024;
const TIMEOUT_MS = 30_000;

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT) return text;
  return text.slice(0, HALF) + "\n\n[...truncated...]\n\n" + text.slice(-HALF);
}

export const bashTool: Tool = {
  name: "bash",
  description: "Execute a shell command and return the output.",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to execute" },
    },
    required: ["command"],
  },
  async execute(input: ToolInput) {
    const { command } = input as { command: string };

    const proc = Bun.spawn(["bash", "-c", command], {
      cwd: SANDBOX_DIR,
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeout = setTimeout(() => proc.kill(), TIMEOUT_MS);

    try {
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      clearTimeout(timeout);

      const exitCode = await proc.exited;
      const output = (stdout + stderr).trim();

      if (exitCode !== 0) {
        return { error: truncate(output || `Exit code: ${exitCode}`) };
      }
      return truncate(output);
    } catch (e) {
      clearTimeout(timeout);
      return { error: `Command failed: ${e}` };
    }
  },
};
