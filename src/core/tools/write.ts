import type { Tool, ToolInput } from "./types";
import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { SANDBOX_DIR } from "../../shared/config";

function safePath(p: string): string | null {
  const resolved = resolve(SANDBOX_DIR, p);
  if (!resolved.startsWith(SANDBOX_DIR)) return null;
  return resolved;
}

export const writeTool: Tool = {
  name: "write",
  description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Creates parent directories as needed.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to sandbox" },
      content: { type: "string", description: "Content to write to the file" },
    },
    required: ["path", "content"],
  },
  async execute(input: ToolInput) {
    const { content } = input as { path: string; content: string };
    const path = safePath(input.path as string);
    if (!path) return { error: "Path outside sandbox" };

    try {
      // Create parent directories if they don't exist
      const dir = dirname(path);
      await mkdir(dir, { recursive: true });

      // Write the file
      await Bun.write(path, content);
      return `Wrote ${content.length} bytes to ${input.path}`;
    } catch (e) {
      return { error: `Failed to write file: ${e}` };
    }
  },
};
