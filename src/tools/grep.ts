import type { Tool } from "./types";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { SANDBOX_DIR } from "../config";

const IGNORE_DIRS = new Set(["node_modules", ".git", ".hg", ".svn", "dist", "build"]);
const MAX_RESULTS = 100;
const MAX_LINE_LENGTH = 200;

function safePath(p: string): string | null {
  const resolved = resolve(SANDBOX_DIR, p);
  if (!resolved.startsWith(SANDBOX_DIR)) return null;
  return resolved;
}

async function grepWithRipgrep(pattern: string, path: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["rg", "--line-number", "--max-count", "10", pattern, path], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode === 0 || exitCode === 1) return output.trim() || null;
    return null;
  } catch {
    return null;
  }
}

async function* walkFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

async function grepWithFs(pattern: string, path: string): Promise<string> {
  const regex = new RegExp(pattern);
  const results: string[] = [];
  const targetPath = resolve(path);
  
  const stats = await stat(targetPath);
  const files: string[] = [];
  
  if (stats.isDirectory()) {
    for await (const file of walkFiles(targetPath)) {
      files.push(file);
    }
  } else {
    files.push(targetPath);
  }
  
  for (const file of files) {
    if (results.length >= MAX_RESULTS) break;
    try {
      const content = await Bun.file(file).text();
      const lines = content.split("\n");
      for (let i = 0; i < lines.length && results.length < MAX_RESULTS; i++) {
        if (regex.test(lines[i])) {
          const line = lines[i].length > MAX_LINE_LENGTH 
            ? lines[i].slice(0, MAX_LINE_LENGTH) + "..." 
            : lines[i];
          results.push(`${file}:${i + 1}:${line}`);
        }
      }
    } catch {
      // Skip unreadable files
    }
  }
  
  return results.join("\n");
}

export const grepTool: Tool = {
  name: "grep",
  description: "Search for a regex pattern in files within sandbox. Returns matching lines as file:line:content.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for" },
      path: { type: "string", description: "File or directory relative to sandbox (default: sandbox root)" },
    },
    required: ["pattern"],
  },
  async execute(input) {
    const pattern = input.pattern as string;
    const inputPath = (input.path as string) || ".";
    const path = safePath(inputPath);
    if (!path) return { error: "Path outside sandbox" };
    
    try {
      const rgResult = await grepWithRipgrep(pattern, path);
      if (rgResult !== null) {
        const lines = rgResult.split("\n").slice(0, MAX_RESULTS);
        return lines.join("\n") || "No matches found.";
      }
      
      const fsResult = await grepWithFs(pattern, path);
      return fsResult || "No matches found.";
    } catch (e) {
      const err = e as Error;
      return { error: `Grep failed: ${err.message}` };
    }
  },
};
