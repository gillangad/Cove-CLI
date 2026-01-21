import type { Tool } from "./types";
import { readTool } from "./read";
import { editTool } from "./edit";
import { bashTool } from "./bash";
import { grepTool } from "./grep";
import { globTool } from "./glob";
import { writeTool } from "./write";
import { deleteTool } from "./delete";
import { moveTool } from "./move";
import { batchReadTool } from "./batch-read";
import { searchReplaceTool } from "./search-replace";
import { testTool } from "./test";
import { todoTool } from "./todo";

export const toolRegistry: Record<string, Tool> = {
  read: readTool,
  edit: editTool,
  bash: bashTool,
  grep: grepTool,
  glob: globTool,
  write: writeTool,
  delete: deleteTool,
  move: moveTool,
  batch_read: batchReadTool,
  search_replace: searchReplaceTool,
  test: testTool,
  todo: todoTool,
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
