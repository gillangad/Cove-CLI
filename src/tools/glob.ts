import type { Tool } from "./types";
import { Glob } from "bun";
import { SANDBOX_DIR } from "../config";

const IGNORE_DIRS = new Set(["node_modules", ".git", ".hg", ".svn", "dist", "build"]);

export const globTool: Tool = {
  name: "glob",
  description: "Find files matching a glob pattern in sandbox. Returns list of matching file paths.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern (e.g. '**/*.ts')" },
    },
    required: ["pattern"],
  },
  async execute(input) {
    const pattern = input.pattern as string;
    try {
      const glob = new Glob(pattern);
      const matches: string[] = [];
      
      for await (const file of glob.scan({ cwd: SANDBOX_DIR, onlyFiles: true })) {
        const parts = file.split("/");
        if (parts.some((p) => IGNORE_DIRS.has(p))) continue;
        matches.push(file);
        if (matches.length >= 500) break;
      }
      
      if (matches.length === 0) return "No files found matching pattern.";
      return matches.join("\n");
    } catch (e) {
      const err = e as Error;
      return { error: `Glob failed: ${err.message}` };
    }
  },
};
