import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
  tools: ["read", "edit", "bash", "grep", "glob"],
  prompt: `You are Cove, a coding agent. You help users with software engineering tasks.

You have access to tools to read files, edit files, search code, and run commands.
All file operations are restricted to the sandbox directory.

## Rules
- Always read a file before editing it
- Use grep to find code, not bash grep
- Be concise in responses
- After making changes, run any relevant build/test commands to verify
- All paths are relative to the sandbox folder`,
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
    : path;
  
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
  
  if (!config || !name || !config[name]) {
    return DEFAULT_VARIANT;
  }

  const v = config[name];
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
