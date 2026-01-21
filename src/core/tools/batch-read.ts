import type { Tool, ToolInput } from "./types";
import { resolve } from "node:path";

function resolvePath(p: string): string {
  return resolve(process.cwd(), p);
}

export const batchReadTool: Tool = {
  name: "batch_read",
  description: "Read multiple files in parallel. Returns contents of all files with their paths.",
  inputSchema: {
    type: "object",
    properties: {
      paths: {
        type: "array",
        items: { type: "string" },
        description: "Array of file paths (relative or absolute)"
      },
    },
    required: ["paths"],
  },
  async execute(input: ToolInput) {
    const { paths } = input as { paths: string[] };

    if (!paths || paths.length === 0) {
      return { error: "No paths provided" };
    }

    const results = await Promise.all(
      paths.map(async (p) => {
        const resolvedPath = resolvePath(p);

        try {
          const file = Bun.file(resolvedPath);
          const exists = await file.exists();
          if (!exists) {
            return { path: p, error: "File not found" };
          }
          const content = await file.text();
          return { path: p, content };
        } catch (e) {
          return { path: p, error: String(e) };
        }
      })
    );

    // Format output
    const output: string[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const result of results) {
      if ("content" in result && result.content !== undefined) {
        output.push(`=== ${result.path} ===`);
        output.push(result.content);
        output.push("");
        successCount++;
      } else if ("error" in result) {
        output.push(`=== ${result.path} ===`);
        output.push(`ERROR: ${result.error}`);
        output.push("");
        errorCount++;
      }
    }

    output.unshift(`Read ${successCount} files, ${errorCount} errors\n`);
    return output.join("\n");
  },
};
