import type { Tool, ToolInput } from "./types";
import { resolve } from "node:path";
import { SANDBOX_DIR } from "../config";

function safePath(p: string): string | null {
  const resolved = resolve(SANDBOX_DIR, p);
  if (!resolved.startsWith(SANDBOX_DIR)) return null;
  return resolved;
}

export const editTool: Tool = {
  name: "edit",
  description: "Edit a file by replacing old_str with new_str. If file doesn't exist and old_str is empty, creates the file.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to sandbox" },
      old_str: { type: "string", description: "Text to find and replace" },
      new_str: { type: "string", description: "Replacement text" },
    },
    required: ["path", "old_str", "new_str"],
  },
  async execute(input: ToolInput) {
    const { old_str, new_str } = input as { path: string; old_str: string; new_str: string };
    const path = safePath(input.path as string);
    if (!path) return { error: "Path outside sandbox" };
    const file = Bun.file(path);
    const exists = await file.exists();

    if (!exists && old_str === "") {
      await Bun.write(path, new_str);
      return `Created ${path}`;
    }

    if (!exists) {
      return { error: `File not found: ${path}` };
    }

    const content = await file.text();
    if (!content.includes(old_str)) {
      return { error: "old_str not found in file" };
    }

    const newContent = content.replace(old_str, new_str);
    await Bun.write(path, newContent);
    return `Updated ${path}`;
  },
};
