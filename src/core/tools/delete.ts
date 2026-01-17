import type { Tool, ToolInput } from "./types";
import { resolve } from "node:path";
import { rm, stat } from "node:fs/promises";
import { SANDBOX_DIR } from "../../shared/config";

function safePath(p: string): string | null {
  const resolved = resolve(SANDBOX_DIR, p);
  if (!resolved.startsWith(SANDBOX_DIR)) return null;
  return resolved;
}

export const deleteTool: Tool = {
  name: "delete",
  description: "Delete a file or directory. For directories, recursively deletes all contents.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File or directory path relative to sandbox" },
    },
    required: ["path"],
  },
  async execute(input: ToolInput) {
    const path = safePath(input.path as string);
    if (!path) return { error: "Path outside sandbox" };

    try {
      // Check if path exists
      const stats = await stat(path).catch(() => null);
      if (!stats) {
        return { error: `Path not found: ${input.path}` };
      }

      const isDir = stats.isDirectory();
      await rm(path, { recursive: true, force: true });
      
      return `Deleted ${isDir ? "directory" : "file"}: ${input.path}`;
    } catch (e) {
      return { error: `Failed to delete: ${e}` };
    }
  },
};
