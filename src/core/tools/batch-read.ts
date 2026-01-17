import type { Tool, ToolInput } from "./types";
import { resolve } from "node:path";
import { SANDBOX_DIR } from "../../shared/config";

function safePath(p: string): string | null {
  const resolved = resolve(SANDBOX_DIR, p);
  if (!resolved.startsWith(SANDBOX_DIR)) return null;
  return resolved;
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
        description: "Array of file paths relative to sandbox" 
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
        const safep = safePath(p);
        if (!safep) {
          return { path: p, error: "Path outside sandbox" };
        }

        try {
          const file = Bun.file(safep);
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
