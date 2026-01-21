import type { Tool, ToolInput } from "./types";
import { resolve } from "node:path";
import { parseErrors, getErrorSummary, type ParsedError } from "../../shared/error-parser";

const MAX_OUTPUT = 30 * 1024;
const HALF = 15 * 1024;
const TIMEOUT_MS = 30_000;

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT) return text;
  return text.slice(0, HALF) + "\n\n[...truncated...]\n\n" + text.slice(-HALF);
}

export const bashTool: Tool = {
  name: "bash",
  description: "Execute a shell command and return its output.",
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
      cwd: process.cwd(),
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
      
      // Parse errors from output
      const parsedErrors = parseErrors(output);
      const errorSummary = getErrorSummary(parsedErrors);

      if (exitCode !== 0) {
        const result: { error: string; parsedErrors?: ParsedError[]; errorSummary?: { errors: number; warnings: number } } = {
          error: truncate(output || `Exit code: ${exitCode}`),
        };
        
        if (parsedErrors.length > 0) {
          result.parsedErrors = parsedErrors;
          result.errorSummary = errorSummary;
        }
        
        return result;
      }
      
      // Even successful commands might have warnings
      if (parsedErrors.length > 0) {
        return {
          output: truncate(output),
          parsedErrors,
          errorSummary,
        };
      }
      
      return truncate(output);
    } catch (e) {
      clearTimeout(timeout);
      return { error: `Command failed: ${e}` };
    }
  },
};
