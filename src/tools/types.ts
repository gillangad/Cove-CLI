export type ToolInput = Record<string, unknown>;

export type ToolResult = string | { output?: string; error?: string };

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (input: ToolInput) => Promise<ToolResult>;
}
