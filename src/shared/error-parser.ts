/**
 * Error Parser - Structured parsing of compiler errors, lint errors, and stack traces
 */

export interface ParsedError {
  type: "typescript" | "eslint" | "runtime" | "test" | "build" | "unknown";
  file?: string;
  line?: number;
  column?: number;
  message: string;
  code?: string; // e.g., "TS2345", "no-unused-vars"
  severity: "error" | "warning";
  stack?: string;
}

// TypeScript error patterns
// src/foo.ts(10,5): error TS2345: Argument of type...
// src/foo.ts:10:5 - error TS2345: Argument of type...
const TS_ERROR_PATTERN_1 = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/;
const TS_ERROR_PATTERN_2 = /^(.+?):(\d+):(\d+)\s*-\s*(error|warning)\s+(TS\d+):\s*(.+)$/;

// Bun/tsc style: error: file.ts:10:5: message
const TS_ERROR_PATTERN_3 = /^(error|warning):\s*(.+?):(\d+):(\d+):\s*(.+)$/;

// ESLint patterns
// /path/file.ts:10:5: error [rule-name]: message
// /path/file.ts:10:5 error rule-name message
const ESLINT_PATTERN_1 = /^(.+?):(\d+):(\d+):\s*(error|warning)\s+\[?([\w\/-]+)\]?:?\s*(.+)$/;
const ESLINT_PATTERN_2 = /^(.+?):(\d+):(\d+)\s+(error|warning)\s+([\w\/-]+)\s+(.+)$/;

// Biome pattern
// path/file.ts:10:5 lint/rule message
const BIOME_PATTERN = /^(.+?):(\d+):(\d+)\s+lint\/([\w-]+)\s+(.+)$/;

// Stack trace patterns
// at Function.execute (src/foo.ts:10:5)
// at Object.<anonymous> (/path/to/file.ts:10:5)
const STACK_PATTERN = /^\s*at\s+.+\s+\((.+?):(\d+):(\d+)\)$/;
const STACK_PATTERN_2 = /^\s*at\s+(.+?):(\d+):(\d+)$/;

// Node/Bun runtime error
// Error: something went wrong
// TypeError: Cannot read property...
const RUNTIME_ERROR_PATTERN = /^(Error|TypeError|ReferenceError|SyntaxError|RangeError):\s*(.+)$/;

// Test failure patterns (Jest/Vitest/Bun)
// FAIL src/foo.test.ts
const TEST_FAIL_PATTERN = /^(?:FAIL|✗|×)\s+(.+\.(?:test|spec)\.[jt]sx?)$/;

// expect(...) failure
// Expected: value
// Received: other
const EXPECT_FAILURE_PATTERN = /^Expected:\s*(.+)$/;

/**
 * Parse a single line for errors
 */
function parseLine(line: string): ParsedError | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // TypeScript errors (pattern 1)
  let match = trimmed.match(TS_ERROR_PATTERN_1);
  if (match) {
    return {
      type: "typescript",
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      severity: match[4] as "error" | "warning",
      code: match[5],
      message: match[6],
    };
  }

  // TypeScript errors (pattern 2)
  match = trimmed.match(TS_ERROR_PATTERN_2);
  if (match) {
    return {
      type: "typescript",
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      severity: match[4] as "error" | "warning",
      code: match[5],
      message: match[6],
    };
  }

  // TypeScript errors (pattern 3)
  match = trimmed.match(TS_ERROR_PATTERN_3);
  if (match) {
    return {
      type: "typescript",
      file: match[2],
      line: parseInt(match[3], 10),
      column: parseInt(match[4], 10),
      severity: match[1] as "error" | "warning",
      message: match[5],
    };
  }

  // ESLint errors (pattern 1)
  match = trimmed.match(ESLINT_PATTERN_1);
  if (match) {
    return {
      type: "eslint",
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      severity: match[4] as "error" | "warning",
      code: match[5],
      message: match[6],
    };
  }

  // ESLint errors (pattern 2)
  match = trimmed.match(ESLINT_PATTERN_2);
  if (match) {
    return {
      type: "eslint",
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      severity: match[4] as "error" | "warning",
      code: match[5],
      message: match[6],
    };
  }

  // Biome errors
  match = trimmed.match(BIOME_PATTERN);
  if (match) {
    return {
      type: "eslint", // Treat biome lint as eslint-like
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      severity: "error",
      code: `lint/${match[4]}`,
      message: match[5],
    };
  }

  // Runtime errors
  match = trimmed.match(RUNTIME_ERROR_PATTERN);
  if (match) {
    return {
      type: "runtime",
      severity: "error",
      message: `${match[1]}: ${match[2]}`,
    };
  }

  // Test failures
  match = trimmed.match(TEST_FAIL_PATTERN);
  if (match) {
    return {
      type: "test",
      file: match[1],
      severity: "error",
      message: `Test failed: ${match[1]}`,
    };
  }

  return null;
}

/**
 * Extract stack trace from error output
 */
function extractStackTrace(lines: string[]): string | undefined {
  const stackLines: string[] = [];
  let inStack = false;

  for (const line of lines) {
    if (line.match(STACK_PATTERN) || line.match(STACK_PATTERN_2)) {
      inStack = true;
      stackLines.push(line);
    } else if (inStack && line.trim().startsWith("at ")) {
      stackLines.push(line);
    } else if (inStack) {
      break;
    }
  }

  return stackLines.length > 0 ? stackLines.join("\n") : undefined;
}

/**
 * Parse error output and return structured errors
 */
export function parseErrors(output: string): ParsedError[] {
  const lines = output.split("\n");
  const errors: ParsedError[] = [];
  const seenMessages = new Set<string>();

  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed) {
      // Deduplicate by message + file + line
      const key = `${parsed.file}:${parsed.line}:${parsed.message}`;
      if (!seenMessages.has(key)) {
        seenMessages.add(key);
        errors.push(parsed);
      }
    }
  }

  // Try to extract and attach stack trace to runtime errors
  const stack = extractStackTrace(lines);
  if (stack) {
    const runtimeError = errors.find((e) => e.type === "runtime");
    if (runtimeError) {
      runtimeError.stack = stack;

      // Try to extract file/line from first stack frame
      const firstFrame = stack.split("\n")[0];
      let match = firstFrame?.match(STACK_PATTERN);
      if (match) {
        runtimeError.file = match[1];
        runtimeError.line = parseInt(match[2], 10);
        runtimeError.column = parseInt(match[3], 10);
      } else {
        match = firstFrame?.match(STACK_PATTERN_2);
        if (match) {
          runtimeError.file = match[1];
          runtimeError.line = parseInt(match[2], 10);
          runtimeError.column = parseInt(match[3], 10);
        }
      }
    }
  }

  return errors;
}

/**
 * Format parsed errors for display
 */
export function formatErrors(errors: ParsedError[]): string {
  if (errors.length === 0) return "";

  const lines: string[] = [];

  for (const error of errors) {
    const location = error.file
      ? `${error.file}${error.line ? `:${error.line}` : ""}${error.column ? `:${error.column}` : ""}`
      : "";
    const code = error.code ? `[${error.code}] ` : "";
    const prefix = error.severity === "error" ? "✗" : "⚠";

    if (location) {
      lines.push(`${prefix} ${location}: ${code}${error.message}`);
    } else {
      lines.push(`${prefix} ${code}${error.message}`);
    }
  }

  return lines.join("\n");
}

/**
 * Get a summary of errors
 */
export function getErrorSummary(errors: ParsedError[]): { errors: number; warnings: number } {
  let errorCount = 0;
  let warningCount = 0;

  for (const error of errors) {
    if (error.severity === "error") {
      errorCount++;
    } else {
      warningCount++;
    }
  }

  return { errors: errorCount, warnings: warningCount };
}

/**
 * Check if output contains errors (quick check without full parsing)
 */
export function hasErrors(output: string): boolean {
  // Quick patterns to check
  const errorPatterns = [
    /\berror\b/i,
    /\bfailed\b/i,
    /\bFAIL\b/,
    /✗/,
    /^Error:/m,
    /TypeError:/,
    /SyntaxError:/,
  ];

  return errorPatterns.some((pattern) => pattern.test(output));
}
