import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface FormatterConfig {
  command: string;
  extensions: string[];
}

export interface LinterConfig {
  command: string;
  extensions: string[];
}

export interface ProjectInfo {
  root: string;
  packageManager: "npm" | "yarn" | "pnpm" | "bun" | null;
  language: "typescript" | "javascript" | "python" | "go" | "rust" | null;
  formatter: FormatterConfig | null;
  linter: LinterConfig | null;
  testCommand: string | null;
}

// Cached project info per session
let cachedProjectInfo: ProjectInfo | null = null;
let cachedRoot: string | null = null;

/**
 * Detect the package manager used in the project
 */
function detectPackageManager(root: string): ProjectInfo["packageManager"] {
  // Check lockfiles in order of preference
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) {
    return "bun";
  }
  if (existsSync(join(root, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (existsSync(join(root, "yarn.lock"))) {
    return "yarn";
  }
  if (existsSync(join(root, "package-lock.json"))) {
    return "npm";
  }
  // Fallback: if package.json exists, assume npm
  if (existsSync(join(root, "package.json"))) {
    return "npm";
  }
  return null;
}

/**
 * Detect the primary language of the project
 */
function detectLanguage(root: string): ProjectInfo["language"] {
  // TypeScript
  if (existsSync(join(root, "tsconfig.json"))) {
    return "typescript";
  }
  // Go
  if (existsSync(join(root, "go.mod"))) {
    return "go";
  }
  // Rust
  if (existsSync(join(root, "Cargo.toml"))) {
    return "rust";
  }
  // Python
  if (
    existsSync(join(root, "pyproject.toml")) ||
    existsSync(join(root, "setup.py")) ||
    existsSync(join(root, "requirements.txt"))
  ) {
    return "python";
  }
  // JavaScript fallback
  if (existsSync(join(root, "package.json"))) {
    return "javascript";
  }
  return null;
}

/**
 * Detect formatter configuration
 */
function detectFormatter(root: string, pkgManager: ProjectInfo["packageManager"]): FormatterConfig | null {
  const runner = pkgManager === "bun" ? "bun" : "npx";

  // Biome (newer, fast formatter)
  if (existsSync(join(root, "biome.json")) || existsSync(join(root, "biome.jsonc"))) {
    return {
      command: `${runner} biome format --write`,
      extensions: [".js", ".jsx", ".ts", ".tsx", ".json", ".css"],
    };
  }

  // Prettier
  const prettierConfigs = [
    ".prettierrc",
    ".prettierrc.json",
    ".prettierrc.yaml",
    ".prettierrc.yml",
    ".prettierrc.js",
    ".prettierrc.cjs",
    ".prettierrc.mjs",
    "prettier.config.js",
    "prettier.config.cjs",
    "prettier.config.mjs",
  ];

  for (const config of prettierConfigs) {
    if (existsSync(join(root, config))) {
      return {
        command: `${runner} prettier --write`,
        extensions: [".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".md", ".html"],
      };
    }
  }

  // Check package.json for prettier dependency
  try {
    const pkgPath = join(root, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.prettier) {
        return {
          command: `${runner} prettier --write`,
          extensions: [".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".md", ".html"],
        };
      }
      if (deps["@biomejs/biome"]) {
        return {
          command: `${runner} biome format --write`,
          extensions: [".js", ".jsx", ".ts", ".tsx", ".json", ".css"],
        };
      }
    }
  } catch {
    // Ignore parse errors
  }

  // Python formatters
  if (existsSync(join(root, "pyproject.toml"))) {
    try {
      const content = readFileSync(join(root, "pyproject.toml"), "utf-8");
      if (content.includes("[tool.black]") || content.includes("black")) {
        return {
          command: "black",
          extensions: [".py"],
        };
      }
      if (content.includes("[tool.ruff]") || content.includes("ruff")) {
        return {
          command: "ruff format",
          extensions: [".py"],
        };
      }
    } catch {
      // Ignore
    }
  }

  return null;
}

/**
 * Detect linter configuration
 */
function detectLinter(root: string, pkgManager: ProjectInfo["packageManager"]): LinterConfig | null {
  const runner = pkgManager === "bun" ? "bun" : "npx";

  // Biome (linter + formatter)
  if (existsSync(join(root, "biome.json")) || existsSync(join(root, "biome.jsonc"))) {
    return {
      command: `${runner} biome check --write`,
      extensions: [".js", ".jsx", ".ts", ".tsx"],
    };
  }

  // ESLint
  const eslintConfigs = [
    ".eslintrc",
    ".eslintrc.json",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.yaml",
    ".eslintrc.yml",
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
  ];

  for (const config of eslintConfigs) {
    if (existsSync(join(root, config))) {
      return {
        command: `${runner} eslint --fix`,
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      };
    }
  }

  // Check package.json for eslint dependency
  try {
    const pkgPath = join(root, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.eslint) {
        return {
          command: `${runner} eslint --fix`,
          extensions: [".js", ".jsx", ".ts", ".tsx"],
        };
      }
    }
  } catch {
    // Ignore
  }

  // Python linters
  if (existsSync(join(root, "pyproject.toml"))) {
    try {
      const content = readFileSync(join(root, "pyproject.toml"), "utf-8");
      if (content.includes("[tool.ruff]") || content.includes("ruff")) {
        return {
          command: "ruff check --fix",
          extensions: [".py"],
        };
      }
    } catch {
      // Ignore
    }
  }

  return null;
}

/**
 * Detect test command from package.json
 */
function detectTestCommand(root: string, pkgManager: ProjectInfo["packageManager"]): string | null {
  // Check for bun test (native)
  if (pkgManager === "bun") {
    return "bun test";
  }

  try {
    const pkgPath = join(root, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
        const runner = pkgManager || "npm";
        return `${runner} test`;
      }
    }
  } catch {
    // Ignore
  }

  // Python
  if (existsSync(join(root, "pytest.ini")) || existsSync(join(root, "pyproject.toml"))) {
    return "pytest";
  }

  // Go
  if (existsSync(join(root, "go.mod"))) {
    return "go test ./...";
  }

  return null;
}

/**
 * Analyze the project at the given root directory
 */
export function analyzeProject(root: string = process.cwd()): ProjectInfo {
  // Return cached if same root
  if (cachedProjectInfo && cachedRoot === root) {
    return cachedProjectInfo;
  }

  const packageManager = detectPackageManager(root);
  const language = detectLanguage(root);
  const formatter = detectFormatter(root, packageManager);
  const linter = detectLinter(root, packageManager);
  const testCommand = detectTestCommand(root, packageManager);

  const projectInfo: ProjectInfo = {
    root,
    packageManager,
    language,
    formatter,
    linter,
    testCommand,
  };

  // Cache the result
  cachedProjectInfo = projectInfo;
  cachedRoot = root;

  return projectInfo;
}

/**
 * Clear the cached project info (useful for testing or when switching projects)
 */
export function clearProjectCache(): void {
  cachedProjectInfo = null;
  cachedRoot = null;
}

/**
 * Run the formatter on a file if applicable
 * Returns true if formatting was run, false otherwise
 */
export async function formatFile(filePath: string): Promise<{ formatted: boolean; error?: string }> {
  const project = analyzeProject();

  if (!project.formatter) {
    return { formatted: false };
  }

  // Check if file extension matches formatter
  const ext = "." + filePath.split(".").pop();
  if (!project.formatter.extensions.includes(ext)) {
    return { formatted: false };
  }

  try {
    const proc = Bun.spawn(["bash", "-c", `${project.formatter.command} "${filePath}"`], {
      cwd: project.root,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return { formatted: false, error: stderr || stdout || `Exit code: ${exitCode}` };
    }

    return { formatted: true };
  } catch (e) {
    return { formatted: false, error: String(e) };
  }
}

/**
 * Get a summary of the project configuration for display
 */
export function getProjectSummary(): string {
  const project = analyzeProject();
  const lines: string[] = [];

  lines.push(`Root: ${project.root}`);

  if (project.packageManager) {
    lines.push(`Package Manager: ${project.packageManager}`);
  }

  if (project.language) {
    lines.push(`Language: ${project.language}`);
  }

  if (project.formatter) {
    lines.push(`Formatter: ${project.formatter.command}`);
  }

  if (project.linter) {
    lines.push(`Linter: ${project.linter.command}`);
  }

  if (project.testCommand) {
    lines.push(`Test: ${project.testCommand}`);
  }

  return lines.join("\n");
}
