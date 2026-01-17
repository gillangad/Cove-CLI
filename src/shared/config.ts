import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

export const SANDBOX_DIR = resolve(process.cwd(), "sandbox");

export function loadEnv() {
  const envPaths = [
    join(homedir(), ".cove", ".env"),
    join(homedir(), ".cove", "config"),
    join(process.cwd(), ".env"),
  ];

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          
          const eqIndex = trimmed.indexOf("=");
          if (eqIndex === -1) continue;
          
          const key = trimmed.slice(0, eqIndex).trim();
          let value = trimmed.slice(eqIndex + 1).trim();
          
          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          
          // Only set if not already in environment
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      } catch {
        // Ignore read errors
      }
    }
  }
}

export function getConfigDir(): string {
  const dir = join(homedir(), ".cove");
  return dir;
}
