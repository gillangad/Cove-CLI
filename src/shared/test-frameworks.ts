/**
 * Test Framework Detection and Result Parsing
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeProject } from "./project-analyzer";

export type TestFramework = "bun" | "vitest" | "jest" | "pytest" | "go" | "cargo" | null;

export interface TestFailure {
  testName: string;
  file?: string;
  line?: number;
  message: string;
  expected?: string;
  received?: string;
  duration?: number;
}

export interface TestResult {
  framework: TestFramework;
  passed: number;
  failed: number;
  skipped: number;
  duration: number; // milliseconds
  failures: TestFailure[];
  raw: string;
}

/**
 * Detect the test framework used in the project
 */
export function detectTestFramework(root: string = process.cwd()): TestFramework {
  const project = analyzeProject(root);

  // Check package.json for test-related dependencies
  try {
    const pkgPath = join(root, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const scripts = pkg.scripts || {};

      // Check scripts first for explicit test command hints
      const testScript = scripts.test || "";

      if (testScript.includes("vitest") || deps.vitest) {
        return "vitest";
      }
      if (testScript.includes("jest") || deps.jest || deps["@jest/core"]) {
        return "jest";
      }
      if (testScript.includes("bun test")) {
        return "bun";
      }
    }
  } catch {
    // Ignore parse errors
  }

  // Check for vitest config
  const vitestConfigs = ["vitest.config.ts", "vitest.config.js", "vitest.config.mts"];
  for (const config of vitestConfigs) {
    if (existsSync(join(root, config))) {
      return "vitest";
    }
  }

  // Check for jest config
  const jestConfigs = ["jest.config.ts", "jest.config.js", "jest.config.json"];
  for (const config of jestConfigs) {
    if (existsSync(join(root, config))) {
      return "jest";
    }
  }

  // Python
  if (existsSync(join(root, "pytest.ini")) || existsSync(join(root, "conftest.py"))) {
    return "pytest";
  }
  if (existsSync(join(root, "pyproject.toml"))) {
    try {
      const content = readFileSync(join(root, "pyproject.toml"), "utf-8");
      if (content.includes("[tool.pytest]") || content.includes("pytest")) {
        return "pytest";
      }
    } catch {
      // Ignore
    }
  }

  // Go
  if (existsSync(join(root, "go.mod"))) {
    return "go";
  }

  // Rust
  if (existsSync(join(root, "Cargo.toml"))) {
    return "cargo";
  }

  // Fallback: if bun is the package manager, use bun test
  if (project.packageManager === "bun") {
    return "bun";
  }

  return null;
}

/**
 * Get the test command for the detected framework
 */
export function getTestCommand(
  framework: TestFramework,
  options?: { pattern?: string; filter?: string; watch?: boolean }
): string | null {
  if (!framework) return null;

  const { pattern, filter, watch } = options || {};

  switch (framework) {
    case "bun": {
      let cmd = "bun test";
      if (pattern) cmd += ` ${pattern}`;
      if (filter) cmd += ` --grep "${filter}"`;
      if (watch) cmd += " --watch";
      return cmd;
    }
    case "vitest": {
      let cmd = "npx vitest run";
      if (watch) cmd = "npx vitest";
      if (pattern) cmd += ` ${pattern}`;
      if (filter) cmd += ` --grep "${filter}"`;
      return cmd;
    }
    case "jest": {
      let cmd = "npx jest";
      if (pattern) cmd += ` ${pattern}`;
      if (filter) cmd += ` -t "${filter}"`;
      if (watch) cmd += " --watch";
      return cmd;
    }
    case "pytest": {
      let cmd = "pytest";
      if (pattern) cmd += ` ${pattern}`;
      if (filter) cmd += ` -k "${filter}"`;
      return cmd;
    }
    case "go": {
      let cmd = "go test";
      if (pattern) {
        cmd += ` ${pattern}`;
      } else {
        cmd += " ./...";
      }
      if (filter) cmd += ` -run "${filter}"`;
      return cmd;
    }
    case "cargo": {
      let cmd = "cargo test";
      if (pattern) cmd += ` --test ${pattern}`;
      if (filter) cmd += ` ${filter}`;
      return cmd;
    }
    default:
      return null;
  }
}

/**
 * Parse test output based on framework
 */
export function parseTestOutput(output: string, framework: TestFramework): TestResult {
  const result: TestResult = {
    framework,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0,
    failures: [],
    raw: output,
  };

  if (!framework) return result;

  switch (framework) {
    case "bun":
      return parseBunTestOutput(output, result);
    case "vitest":
      return parseVitestOutput(output, result);
    case "jest":
      return parseJestOutput(output, result);
    case "pytest":
      return parsePytestOutput(output, result);
    case "go":
      return parseGoTestOutput(output, result);
    case "cargo":
      return parseCargoTestOutput(output, result);
    default:
      return result;
  }
}

/**
 * Parse Bun test output
 */
function parseBunTestOutput(output: string, result: TestResult): TestResult {
  const lines = output.split("\n");

  // Match: bun test v1.x.x (linux-x64)
  // Match: ✓ test name [0.12ms]
  // Match: ✗ test name [0.12ms]
  const passPattern = /^✓\s+(.+?)\s+\[(\d+(?:\.\d+)?)\s*ms\]/;
  const failPattern = /^✗\s+(.+?)\s+\[(\d+(?:\.\d+)?)\s*ms\]/;
  const summaryPattern = /(\d+)\s+pass.*?(\d+)\s+fail/i;
  const durationPattern = /Ran\s+\d+\s+tests.*?in\s+(\d+(?:\.\d+)?)\s*(ms|s)/i;

  let currentTest: TestFailure | null = null;

  for (const line of lines) {
    // Check for pass
    let match = line.match(passPattern);
    if (match) {
      result.passed++;
      continue;
    }

    // Check for fail
    match = line.match(failPattern);
    if (match) {
      result.failed++;
      currentTest = {
        testName: match[1],
        message: "",
        duration: parseFloat(match[2]),
      };
      result.failures.push(currentTest);
      continue;
    }

    // Capture failure message
    if (currentTest && line.includes("expect(")) {
      currentTest.message = line.trim();
    }

    // Check for expected/received
    if (currentTest) {
      if (line.includes("Expected:")) {
        currentTest.expected = line.replace(/^.*Expected:\s*/, "").trim();
      }
      if (line.includes("Received:")) {
        currentTest.received = line.replace(/^.*Received:\s*/, "").trim();
      }
    }

    // Summary
    match = line.match(summaryPattern);
    if (match) {
      result.passed = parseInt(match[1], 10);
      result.failed = parseInt(match[2], 10);
    }

    // Duration
    match = line.match(durationPattern);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2];
      result.duration = unit === "s" ? value * 1000 : value;
    }
  }

  return result;
}

/**
 * Parse Vitest output
 */
function parseVitestOutput(output: string, result: TestResult): TestResult {
  const lines = output.split("\n");

  // ✓ test name (0.12ms)
  // ✗ test name
  const passPattern = /^\s*✓\s+(.+?)(?:\s+\((\d+(?:\.\d+)?)\s*ms\))?$/;
  const failPattern = /^\s*[✗×]\s+(.+)/;
  const summaryPattern = /Tests\s+(\d+)\s+passed.*?(\d+)\s+failed/i;
  const durationPattern = /Duration\s+(\d+(?:\.\d+)?)\s*(ms|s)/i;

  for (const line of lines) {
    let match = line.match(passPattern);
    if (match) {
      result.passed++;
      continue;
    }

    match = line.match(failPattern);
    if (match) {
      result.failed++;
      result.failures.push({
        testName: match[1],
        message: "",
      });
      continue;
    }

    match = line.match(summaryPattern);
    if (match) {
      result.passed = parseInt(match[1], 10);
      result.failed = parseInt(match[2], 10);
    }

    match = line.match(durationPattern);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2];
      result.duration = unit === "s" ? value * 1000 : value;
    }
  }

  return result;
}

/**
 * Parse Jest output
 */
function parseJestOutput(output: string, result: TestResult): TestResult {
  // Jest output format:
  // PASS src/foo.test.ts
  // FAIL src/bar.test.ts
  // Tests: 5 passed, 2 failed, 7 total
  const passFilePattern = /^PASS\s+(.+)$/m;
  const failFilePattern = /^FAIL\s+(.+)$/m;
  const summaryPattern = /Tests:\s+(\d+)\s+passed,\s*(\d+)\s+failed/i;
  const durationPattern = /Time:\s+(\d+(?:\.\d+)?)\s*(ms|s)/i;

  const passMatches = output.match(new RegExp(passFilePattern.source, "gm")) || [];
  const failMatches = output.match(new RegExp(failFilePattern.source, "gm")) || [];

  // Count test files (rough estimate)
  result.passed = passMatches.length;
  result.failed = failMatches.length;

  // Try to get actual test counts from summary
  const summaryMatch = output.match(summaryPattern);
  if (summaryMatch) {
    result.passed = parseInt(summaryMatch[1], 10);
    result.failed = parseInt(summaryMatch[2], 10);
  }

  const durationMatch = output.match(durationPattern);
  if (durationMatch) {
    const value = parseFloat(durationMatch[1]);
    const unit = durationMatch[2];
    result.duration = unit === "s" ? value * 1000 : value;
  }

  // Extract failures
  for (const match of failMatches) {
    const file = match.replace(/^FAIL\s+/, "");
    result.failures.push({
      testName: file,
      file,
      message: "Test file failed",
    });
  }

  return result;
}

/**
 * Parse pytest output
 */
function parsePytestOutput(output: string, result: TestResult): TestResult {
  // pytest output:
  // ===== 3 passed, 1 failed in 0.12s =====
  const summaryPattern = /(\d+)\s+passed.*?(\d+)\s+failed.*?in\s+(\d+(?:\.\d+)?)\s*s/i;
  const failPattern = /FAILED\s+(.+?)::(.+?)\s+-/;

  const summaryMatch = output.match(summaryPattern);
  if (summaryMatch) {
    result.passed = parseInt(summaryMatch[1], 10);
    result.failed = parseInt(summaryMatch[2], 10);
    result.duration = parseFloat(summaryMatch[3]) * 1000;
  }

  const failMatches = output.match(new RegExp(failPattern.source, "gm")) || [];
  for (const line of failMatches) {
    const match = line.match(failPattern);
    if (match) {
      result.failures.push({
        testName: match[2],
        file: match[1],
        message: "",
      });
    }
  }

  return result;
}

/**
 * Parse Go test output
 */
function parseGoTestOutput(output: string, result: TestResult): TestResult {
  // go test output:
  // --- PASS: TestFoo (0.00s)
  // --- FAIL: TestBar (0.01s)
  // ok      package     0.123s
  const passPattern = /^---\s+PASS:\s+(.+?)\s+\((\d+(?:\.\d+)?)\s*s\)/gm;
  const failPattern = /^---\s+FAIL:\s+(.+?)\s+\((\d+(?:\.\d+)?)\s*s\)/gm;
  const durationPattern = /^ok\s+.+?\s+(\d+(?:\.\d+)?)\s*s/m;

  let match;
  while ((match = passPattern.exec(output)) !== null) {
    result.passed++;
  }

  while ((match = failPattern.exec(output)) !== null) {
    result.failed++;
    result.failures.push({
      testName: match[1],
      message: "",
      duration: parseFloat(match[2]) * 1000,
    });
  }

  const durationMatch = output.match(durationPattern);
  if (durationMatch) {
    result.duration = parseFloat(durationMatch[1]) * 1000;
  }

  return result;
}

/**
 * Parse Cargo test output
 */
function parseCargoTestOutput(output: string, result: TestResult): TestResult {
  // cargo test output:
  // test tests::test_foo ... ok
  // test tests::test_bar ... FAILED
  // test result: FAILED. 1 passed; 1 failed; 0 ignored
  const passPattern = /^test\s+(.+?)\s+\.\.\.\s+ok$/gm;
  const failPattern = /^test\s+(.+?)\s+\.\.\.\s+FAILED$/gm;
  const summaryPattern = /test result:.*?(\d+)\s+passed;\s*(\d+)\s+failed/i;
  const durationPattern = /finished in\s+(\d+(?:\.\d+)?)\s*s/i;

  let match;
  while ((match = passPattern.exec(output)) !== null) {
    result.passed++;
  }

  while ((match = failPattern.exec(output)) !== null) {
    result.failed++;
    result.failures.push({
      testName: match[1],
      message: "",
    });
  }

  const summaryMatch = output.match(summaryPattern);
  if (summaryMatch) {
    result.passed = parseInt(summaryMatch[1], 10);
    result.failed = parseInt(summaryMatch[2], 10);
  }

  const durationMatch = output.match(durationPattern);
  if (durationMatch) {
    result.duration = parseFloat(durationMatch[1]) * 1000;
  }

  return result;
}

/**
 * Format test results for display
 */
export function formatTestResult(result: TestResult): string {
  const lines: string[] = [];

  const statusIcon = result.failed > 0 ? "✗" : "✓";
  const total = result.passed + result.failed + result.skipped;
  const duration = result.duration > 1000
    ? `${(result.duration / 1000).toFixed(2)}s`
    : `${result.duration.toFixed(0)}ms`;

  lines.push(`${statusIcon} Tests: ${result.passed} passed, ${result.failed} failed (${duration})`);

  if (result.failures.length > 0) {
    lines.push("");
    lines.push("Failures:");
    for (const failure of result.failures) {
      const location = failure.file
        ? `${failure.file}${failure.line ? `:${failure.line}` : ""}`
        : "";
      lines.push(`  ✗ ${failure.testName}${location ? ` (${location})` : ""}`);
      if (failure.message) {
        lines.push(`    ${failure.message}`);
      }
      if (failure.expected !== undefined && failure.received !== undefined) {
        lines.push(`    Expected: ${failure.expected}`);
        lines.push(`    Received: ${failure.received}`);
      }
    }
  }

  return lines.join("\n");
}
