import type { Tool, ToolInput } from "./types";
import { resolve, dirname } from "node:path";
import { rename, mkdir, stat } from "node:fs/promises";

function resolvePath(p: string): string {
  return resolve(process.cwd(), p);
}

export const moveTool: Tool = {
  name: "move",
  description: "Move or rename a file or directory.",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "Source path (relative or absolute)" },
      destination: { type: "string", description: "Destination path (relative or absolute)" },
    },
    required: ["source", "destination"],
  },
  async execute(input: ToolInput) {
    const { source, destination } = input as { source: string; destination: string };
    const srcPath = resolvePath(source);
    const destPath = resolvePath(destination);

    try {
      // Check if source exists
      const stats = await stat(srcPath).catch(() => null);
      if (!stats) {
        return { error: `Source not found: ${source}` };
      }

      // Create destination parent directory if needed
      const destDir = dirname(destPath);
      await mkdir(destDir, { recursive: true });

      // Move file/directory
      await rename(srcPath, destPath);

      return `Moved ${source} to ${destination}`;
    } catch (e) {
      return { error: `Failed to move: ${e}` };
    }
  },
};
