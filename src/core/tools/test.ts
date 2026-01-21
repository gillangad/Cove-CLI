import type { Tool, ToolInput } from "./types";
import {
  detectTestFramework,
  getTestCommand,
  parseTestOutput,
  formatTestResult,
  type TestResult,
} from "../../shared/test-frameworks";

const TIMEOUT_MS = 120_000; // 2 minutes for tests

export const testTool: Tool = {
  name: "test",
  description:
    "Run tests. Auto-detects test framework (bun/vitest/jest/pytest/go/cargo). Returns structured results with pass/fail counts and failure details.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Test file or pattern to run (optional, runs all tests if not specified)",
      },
      filter: {
        type: "string",
        description: "Filter tests by name (optional)",
      },
      watch: {
        type: "boolean",
        description: "Run in watch mode (default: false)",
      },
    },
    required: [],
  },
  async execute(input: ToolInput) {
    const { pattern, filter, watch } = input as {
      pattern?: string;
      filter?: string;
      watch?: boolean;
    };

    const framework = detectTestFramework();

    if (!framework) {
      return {
        error: "Could not detect test framework. Supported: bun, vitest, jest, pytest, go, cargo",
      };
    }

    const command = getTestCommand(framework, { pattern, filter, watch });

    if (!command) {
      return { error: `Could not generate test command for framework: ${framework}` };
    }

    const proc = Bun.spawn(["bash", "-c", command], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeout = setTimeout(() => proc.kill(), TIMEOUT_MS);

    try {
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      clearTimeout(timeout);

      await proc.exited;

      const output = stdout + stderr;
      const result = parseTestOutput(output, framework);

      return {
        framework,
        command,
        passed: result.passed,
        failed: result.failed,
        skipped: result.skipped,
        duration: result.duration,
        failures: result.failures,
        summary: formatTestResult(result),
        raw: output.length > 5000 ? output.slice(0, 5000) + "\n...[truncated]" : output,
      };
    } catch (e) {
      clearTimeout(timeout);
      return { error: `Test execution failed: ${e}` };
    }
  },
};
