/**
 * Logger utility for verbose mode
 * Used by both CLI and TUI
 */
export class Logger {
  private static enabled = false;

  static isEnabled(): boolean {
    return Logger.enabled;
  }

  static enable(): void {
    Logger.enabled = true;
  }

  static disable(): void {
    Logger.enabled = false;
  }

  static toggle(): boolean {
    Logger.enabled = !Logger.enabled;
    return Logger.enabled;
  }

  static debug(message: string, data?: unknown): void {
    if (Logger.enabled) {
      console.error(`[DEBUG] ${message}`, data !== undefined ? data : "");
    }
  }

  static info(message: string): void {
    if (Logger.enabled) {
      console.error(`[INFO] ${message}`);
    }
  }

  static tool(toolName: string, params: unknown, result: unknown): void {
    if (Logger.enabled) {
      console.error(`[TOOL] ${toolName}`);
      console.error(`  Params:`, JSON.stringify(params, null, 2));
      console.error(`  Result:`, typeof result === "string" ? result.slice(0, 200) : JSON.stringify(result, null, 2));
    }
  }

  static llm(event: string, data?: unknown): void {
    if (Logger.enabled) {
      console.error(`[LLM] ${event}`, data !== undefined ? data : "");
    }
  }
}
