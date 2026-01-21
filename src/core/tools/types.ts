export type ToolInput = Record<string, unknown>;

export interface DiffLine {
  type: "added" | "removed" | "context";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffInfo {
  filePath: string;
  lines: DiffLine[];
  totalChanges: number;
}

export type ToolResult = string | { output?: string; error?: string; diff?: DiffInfo };

export interface ToolCallError {
  message: string;
  code?: string;
  canRetry: boolean;
}

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
