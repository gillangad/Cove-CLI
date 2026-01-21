import type { Tool, ToolInput } from "./types";
import { resolve } from "node:path";
import { rm, stat } from "node:fs/promises";

function resolvePath(p: string): string {
  return resolve(process.cwd(), p);
}

export const deleteTool: Tool = {
  name: "delete",
  description: "Delete a file or directory. For directories, recursively deletes all contents.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File or directory path (relative or absolute)" },
    },
    required: ["path"],
  },
  async execute(input: ToolInput) {
    const path = resolvePath(input.path as string);

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
