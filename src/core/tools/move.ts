import type { Tool, ToolInput } from "./types";
import { resolve, dirname } from "node:path";
import { rename, mkdir, stat } from "node:fs/promises";
import { SANDBOX_DIR } from "../../shared/config";

function safePath(p: string): string | null {
  const resolved = resolve(SANDBOX_DIR, p);
  if (!resolved.startsWith(SANDBOX_DIR)) return null;
  return resolved;
}

export const moveTool: Tool = {
  name: "move",
  description: "Move or rename a file or directory.",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "Source path relative to sandbox" },
      destination: { type: "string", description: "Destination path relative to sandbox" },
    },
    required: ["source", "destination"],
  },
  async execute(input: ToolInput) {
    const { source, destination } = input as { source: string; destination: string };
    const srcPath = safePath(source);
    const destPath = safePath(destination);

    if (!srcPath) return { error: "Source path outside sandbox" };
    if (!destPath) return { error: "Destination path outside sandbox" };

    try {
      // Check if source exists
      const stats = await stat(srcPath).catch(() => null);
      if (!stats) {
        return { error: `Source not found: ${source}` };
      }

      // Create destination parent directory if needed
      const destDir = dirname(destPath);
      await mkdir(destDir, { recursive: true });

      // Move the file/directory
      await rename(srcPath, destPath);
      
      return `Moved ${source} to ${destination}`;
    } catch (e) {
      return { error: `Failed to move: ${e}` };
    }
  },
};
