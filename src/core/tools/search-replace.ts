import type { Tool, ToolInput } from "./types";
import { resolve, join } from "node:path";
import { readdir } from "node:fs/promises";

function resolvePath(p: string): string {
  return resolve(process.cwd(), p);
}

async function findFiles(pattern: string, dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string) {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          // Simple glob matching: *.ts matches .ts files
          if (pattern === "*" || entry.name.endsWith(pattern.replace("*", ""))) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Directory not readable, skip
    }
  }

  await walk(dir);
  return files;
}

export const searchReplaceTool: Tool = {
  name: "search_replace",
  description: "Search and replace text across multiple files. Supports file patterns like *.ts",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Text pattern to search for" },
      replacement: { type: "string", description: "Text to replace with" },
      glob: { type: "string", description: "File pattern like *.ts (optional, defaults to all files)" },
      paths: {
        type: "array",
        items: { type: "string" },
        description: "Specific files to search (optional, overrides glob)"
      },
    },
    required: ["pattern", "replacement"],
  },
  async execute(input: ToolInput) {
    const { pattern, replacement, glob, paths } = input as {
      pattern: string;
      replacement: string;
      glob?: string;
      paths?: string[]
    };

    if (!pattern) {
      return { error: "Pattern is required" };
    }

    let filePaths: string[] = [];

    // Get files to search
    if (paths && paths.length > 0) {
      for (const p of paths) {
        filePaths.push(resolvePath(p));
      }
    } else {
      // Find files matching glob pattern
      const fileGlob = glob || "*";
      filePaths = await findFiles(fileGlob, process.cwd());
    }

    if (filePaths.length === 0) {
      return { error: "No files found to search" };
    }

    let filesModified = 0;
    let totalReplacements = 0;
    const modifiedFiles: string[] = [];

    for (const filePath of filePaths) {
      try {
        const file = Bun.file(filePath);
        const exists = await file.exists();
        if (!exists) continue;

        const content = await file.text();

        // Count occurrences
        const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
        const matches = content.match(regex);

        if (matches && matches.length > 0) {
          const newContent = content.split(pattern).join(replacement);
          await Bun.write(filePath, newContent);

          filesModified++;
          totalReplacements += matches.length;

          // Get relative path for output
          const relativePath = filePath.replace(process.cwd() + "/", "");
          modifiedFiles.push(`${relativePath}: ${matches.length} replacements`);
        }
      } catch {
        // Skip files that can't be read/written
      }
    }

    if (filesModified === 0) {
      return `Pattern "${pattern}" not found in any files`;
    }

    return `Modified ${filesModified} files, ${totalReplacements} replacements:\n${modifiedFiles.join("\n")}`;
  },
};
