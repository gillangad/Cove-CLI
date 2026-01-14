import type { Tool } from "./types";
import { resolve } from "node:path";
import { SANDBOX_DIR } from "../config";

function safePath(p: string): string | null {
  const resolved = resolve(SANDBOX_DIR, p);
  if (!resolved.startsWith(SANDBOX_DIR)) return null;
  return resolved;
}

export const readTool: Tool = {
  name: "read",
  description: "Read the contents of a file at the given path (relative to sandbox).",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to sandbox" },
    },
    required: ["path"],
  },
  async execute(input) {
    const path = safePath(input.path as string);
    if (!path) return { error: "Path outside sandbox" };
    try {
      const content = await Bun.file(path).text();
      return content;
    } catch (e) {
      const err = e as Error;
      return { error: `Failed to read file: ${err.message}` };
    }
  },
};
