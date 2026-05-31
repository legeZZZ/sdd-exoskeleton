import * as child_process from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModuleInfo {
  name: string;
  path: string;
  files: string[];
  exports: string[];
}

export interface CallEdge {
  from: string;
  to: string;
  kind: "call" | "import" | "extend";
}

export interface DepEdge {
  source: string;
  target: string;
  type: "import" | "call" | "data";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CODEGRAPH_PACKAGE = "@colbymchenry/codegraph";
const CODEGRAPH_DIR = ".codegraph";
const INDEX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const VERSION_TIMEOUT_MS = 15_000;

const ENTRY_PATTERNS: readonly string[] = [
  "index.ts",
  "index.tsx",
  "index.js",
  "index.jsx",
  "main.ts",
  "main.tsx",
  "main.js",
  "main.jsx",
  "main.py",
  "app.py",
  "main.go",
  "main.rs",
  "lib.rs",
  "app.js",
  "app.ts",
  "server.ts",
  "server.js",
];

const SRC_DIRS: readonly string[] = ["src", "lib", "app", "source", "sources", "."];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether the CodeGraph CLI is reachable via npx.
 * Never throws -- returns false on any failure.
 */
export async function isInstalled(): Promise<boolean> {
  try {
    await execAsync(`npx ${CODEGRAPH_PACKAGE} --version`, {
      timeout: VERSION_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether a project has been indexed by CodeGraph.
 * Returns true when `.codegraph/` exists and is non-empty.
 */
export async function isIndexed(projectDir: string): Promise<boolean> {
  try {
    const cgDir = path.join(projectDir, CODEGRAPH_DIR);
    if (!fs.existsSync(cgDir)) return false;
    const entries = fs.readdirSync(cgDir);
    return entries.length > 0;
  } catch {
    return false;
  }
}

/**
 * Run CodeGraph index on the given project directory.
 * Returns `{ success: false, output }` on failure -- never throws.
 */
export async function indexProject(
  projectDir: string,
): Promise<{ success: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execAsync(
      `npx ${CODEGRAPH_PACKAGE} index`,
      {
        cwd: projectDir,
        timeout: INDEX_TIMEOUT_MS,
      },
    );
    return { success: true, output: stdout + stderr };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, output: message };
  }
}

/**
 * Get top-level modules discovered in the project.
 *
 * Implementation note: the primary path is querying CodeGraph via MCP or CLI,
 * but that integration is not yet available.  As a fallback we scan well-known
 * source directories for directories and files.
 */
export async function getModules(projectDir: string): Promise<ModuleInfo[]> {
  try {
    return await getModulesFromCodeGraph(projectDir);
  } catch {
    return getModulesFallback(projectDir);
  }
}

/**
 * Get call-graph edges involving the given symbol.
 *
 * **Stub** -- returns an empty array until CodeGraph MCP querying is
 * implemented in a future iteration.
 */
export async function getCallGraph(
  _projectDir: string,
  _symbol: string,
): Promise<CallEdge[]> {
  return [];
}

/**
 * Get dependency edges for the project.
 *
 * **Stub** -- returns an empty array until CodeGraph MCP querying is
 * implemented in a future iteration.
 */
export async function getDependencies(_projectDir: string): Promise<DepEdge[]> {
  return [];
}

/**
 * Detect likely entry-point files using common naming conventions.
 *
 * Scans well-known source directories (src, lib, app, source, sources, root)
 * for files matching common entry-point names (index.*, main.*, app.*, etc.).
 */
export async function getEntryPoints(projectDir: string): Promise<string[]> {
  const entries: string[] = [];

  for (const srcDir of SRC_DIRS) {
    const fullSrcDir = path.join(projectDir, srcDir);
    if (!fs.existsSync(fullSrcDir)) continue;

    for (const pattern of ENTRY_PATTERNS) {
      const candidate = path.join(srcDir, pattern);
      const fullPath = path.join(projectDir, candidate);
      if (fs.existsSync(fullPath)) {
        entries.push(candidate);
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to retrieve modules via CodeGraph CLI.
 * Throws on failure so the caller can fall back.
 */
async function getModulesFromCodeGraph(
  _projectDir: string,
): Promise<ModuleInfo[]> {
  // TODO: query CodeGraph MCP or CLI once the query surface is stable.
  throw new Error("CodeGraph module query not yet implemented");
}

/** Fallback module discovery -- scans well-known source directories. */
function getModulesFallback(projectDir: string): ModuleInfo[] {
  const srcDirs = ["src", "lib", "app", "source"];
  const modules: ModuleInfo[] = [];

  for (const srcDir of srcDirs) {
    const fullSrcDir = path.join(projectDir, srcDir);
    if (!fs.existsSync(fullSrcDir)) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(fullSrcDir, { withFileTypes: true });
    } catch {
      continue; // unreadable directory
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const modulePath = path.join(srcDir, entry.name);
        const absoluteModulePath = path.join(projectDir, modulePath);
        const filePaths = listFilesRecursive(absoluteModulePath);
        modules.push({
          name: entry.name,
          path: modulePath,
          files: filePaths.map((f) => path.relative(projectDir, f)),
          exports: [],
        });
      } else if (entry.isFile() && /\.[jt]sx?$/.test(entry.name)) {
        const filePath = path.join(srcDir, entry.name);
        modules.push({
          name: entry.name.replace(/\.\w+$/, ""),
          path: filePath,
          files: [filePath],
          exports: [],
        });
      }
    }
  }

  return modules;
}

/** Recursively collect file paths under a directory. */
function listFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results; // unreadable directory
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Exec wrapper (exported so tests can mock it)
// ---------------------------------------------------------------------------

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export function execAsync(
  command: string,
  options?: { cwd?: string; timeout?: number },
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    child_process.exec(
      command,
      { cwd: options?.cwd, timeout: options?.timeout },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
  });
}
