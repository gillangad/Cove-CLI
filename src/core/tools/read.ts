import type { Tool } from "./types";
import { resolve } from "node:path";

function resolvePath(p: string): string {
  return resolve(process.cwd(), p);
}

export const readTool: Tool = {
  name: "read",
  description: "Read the contents of a file at the given path.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path (relative or absolute)" },
    },
    required: ["path"],
  },
  async execute(input) {
    const path = resolvePath(input.path as string);
    try {
      const content = await Bun.file(path).text();
      return content;
    } catch (e) {
      const err = e as Error;
      return { error: `Failed to read file: ${err.message}` };
    }
  },
};
