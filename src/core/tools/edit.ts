import type { Tool, ToolInput, DiffLine, DiffInfo } from "./types";
import { resolve } from "node:path";
import { formatFile } from "../../shared/project-analyzer";

const CONTEXT_LINES = 2;

function resolvePath(p: string): string {
  return resolve(process.cwd(), p);
}

function generateDiff(
  oldContent: string,
  newContent: string,
  filePath: string
): DiffInfo {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const diffLines: DiffLine[] = [];
  
  // Simple diff: find first difference point and generate context
  let firstDiff = 0;
  while (firstDiff < oldLines.length && firstDiff < newLines.length && oldLines[firstDiff] === newLines[firstDiff]) {
    firstDiff++;
  }
  
  // Find last matching point from end
  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd > firstDiff && newEnd > firstDiff && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd--;
    newEnd--;
  }
  
  // Add context before
  const contextStart = Math.max(0, firstDiff - CONTEXT_LINES);
  for (let i = contextStart; i < firstDiff; i++) {
    diffLines.push({
      type: "context",
      content: oldLines[i],
      oldLineNumber: i + 1,
      newLineNumber: i + 1,
    });
  }
  
  // Add removed lines
  for (let i = firstDiff; i <= oldEnd; i++) {
    diffLines.push({
      type: "removed",
      content: oldLines[i],
      oldLineNumber: i + 1,
    });
  }
  
  // Add added lines
  const addedOffset = firstDiff;
  for (let i = firstDiff; i <= newEnd; i++) {
    diffLines.push({
      type: "added",
      content: newLines[i],
      newLineNumber: i + 1,
    });
  }
  
  // Add context after
  const contextEnd = Math.min(oldLines.length - 1, oldEnd + CONTEXT_LINES);
  for (let i = oldEnd + 1; i <= contextEnd; i++) {
    const newLineNum = i + (newEnd - oldEnd);
    diffLines.push({
      type: "context",
      content: oldLines[i],
      oldLineNumber: i + 1,
      newLineNumber: newLineNum + 1,
    });
  }
  
  const totalChanges = diffLines.filter(l => l.type !== "context").length;
  
  return {
    filePath,
    lines: diffLines,
    totalChanges,
  };
}

export const editTool: Tool = {
  name: "edit",
  description: "Edit a file by replacing old_str with new_str. If file doesn't exist and old_str is empty, creates file.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path (relative or absolute)" },
      old_str: { type: "string", description: "Text to find and replace" },
      new_str: { type: "string", description: "Replacement text" },
    },
    required: ["path", "old_str", "new_str"],
  },
  async execute(input: ToolInput) {
    const { old_str, new_str } = input as { path: string; old_str: string; new_str: string };
    const path = resolvePath(input.path as string);
    const relativePath = (input.path as string).startsWith("/") ? path : (input.path as string);
    const file = Bun.file(path);
    const exists = await file.exists();

    if (!exists && old_str === "") {
      await Bun.write(path, new_str);
      // Auto-format the new file
      const formatResult = await formatFile(path);
      // Generate diff for new file creation
      const diff = generateDiff("", new_str, relativePath);
      const output = formatResult.formatted 
        ? `Created ${relativePath} (formatted)`
        : `Created ${relativePath}`;
      return { output, diff };
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
    
    // Auto-format the edited file
    const formatResult = await formatFile(path);
    
    const diff = generateDiff(content, newContent, relativePath);
    const output = formatResult.formatted 
      ? `Updated ${relativePath} (formatted)`
      : `Updated ${relativePath}`;
    return { output, diff };
  },
};
