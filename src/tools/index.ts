import type { Tool } from "./types";
import { readTool } from "./read";
import { editTool } from "./edit";
import { bashTool } from "./bash";
import { grepTool } from "./grep";
import { globTool } from "./glob";

export const tools: Tool[] = [readTool, editTool, bashTool, grepTool, globTool];

export function getToolByName(name: string): Tool | undefined {
  return tools.find((t) => t.name === name);
}

export function getToolDeclarations() {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  }));
}

export type { Tool, ToolInput, ToolResult } from "./types";
