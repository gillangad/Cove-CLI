import type { Tool, ToolInput } from "./types";
import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { formatFile } from "../../shared/project-analyzer";

function resolvePath(p: string): string {
  return resolve(process.cwd(), p);
}

export const writeTool: Tool = {
  name: "write",
  description: "Write content to a file. Creates file if it doesn't exist, overwrites if it does. Creates parent directories as needed.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path (relative or absolute)" },
      content: { type: "string", description: "Content to write to file" },
    },
    required: ["path", "content"],
  },
  async execute(input: ToolInput) {
    const { content } = input as { path: string; content: string };
    const path = resolvePath(input.path as string);

    try {
      // Create parent directories if they don't exist
      const dir = dirname(path);
      await mkdir(dir, { recursive: true });

      // Write file
      await Bun.write(path, content);
      
      // Auto-format the file
      const formatResult = await formatFile(path);
      
      const output = formatResult.formatted
        ? `Wrote ${content.length} bytes to ${input.path} (formatted)`
        : `Wrote ${content.length} bytes to ${input.path}`;
      return output;
    } catch (e) {
      return { error: `Failed to write file: ${e}` };
    }
  },
};
