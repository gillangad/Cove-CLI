import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

export interface Variant {
  tools: string[];
  prompt: string;
}

interface VariantsConfig {
  [name: string]: {
    tools: string[];
    prompt: string;
  };
}

const DEFAULT_VARIANT: Variant = {
  tools: ["read", "edit", "write", "delete", "move", "bash", "grep", "glob", "batch_read", "search_replace", "test", "todo"],
  prompt: `You are Cove, built by Gill.
  
  You are an interactive CLI tool that helps users with software engineering tasks.
  You have access to tools to read files, write files, edit files, delete files, move files, run commands, search code, find files, run tests, and manage a task list.

## Rules
- Always read a file before editing it
- Use grep to find code, not bash grep
- Be concise in responses
- After making changes, run any relevant build/test commands to verify
- All paths are relative to the current working directory
- Use the todo tool to plan and track complex multi-step tasks
- Mark todos as completed as soon as you finish each task`,
};

function loadVariantsConfig(): VariantsConfig | null {
  const paths = [
    join(process.cwd(), "variants.json"),
    join(homedir(), ".cove", "variants.json"),
  ];

  for (const p of paths) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf-8"));
      } catch {
        // ignore
      }
    }
  }
  return null;
}

function loadPromptFile(path: string): string | null {
  const resolved = path.startsWith("~") 
    ? join(homedir(), path.slice(1)) 
    : resolve(process.cwd(), path);
  
  if (existsSync(resolved)) {
    try {
      return readFileSync(resolved, "utf-8");
    } catch {
      // ignore
    }
  }
  return null;
}

export function loadVariant(name?: string): Variant {
  const config = loadVariantsConfig();
  const variantName = name ?? "default";
  
  if (!config || !config[variantName]) {
    return DEFAULT_VARIANT;
  }

  const v = config[variantName];
  const prompt = loadPromptFile(v.prompt) ?? DEFAULT_VARIANT.prompt;
  
  return {
    tools: v.tools,
    prompt,
  };
}

export function listVariants(): string[] {
  const config = loadVariantsConfig();
  return config ? Object.keys(config) : ["default"];
}
