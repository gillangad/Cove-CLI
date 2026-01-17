import type { Tool } from "./types";
import { readTool } from "./read";
import { editTool } from "./edit";
import { bashTool } from "./bash";
import { grepTool } from "./grep";
import { globTool } from "./glob";

export const toolRegistry: Record<string, Tool> = {
  read: readTool,
  edit: editTool,
  bash: bashTool,
  grep: grepTool,
  glob: globTool,
};

export function getTools(names: string[]): Tool[] {
  return names.map((n) => {
    const tool = toolRegistry[n];
    if (!tool) throw new Error(`Unknown tool: ${n}`);
    return tool;
  });
}

export function listTools(): string[] {
  return Object.keys(toolRegistry);
}
