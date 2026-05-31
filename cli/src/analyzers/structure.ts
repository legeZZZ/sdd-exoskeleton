import type { ModuleInfo, DepEdge } from "../integrations/codegraph.js";
import type { ApiInfo } from "../integrations/obsidian.js";
import { getDependencies } from "../integrations/codegraph.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModuleTopology {
  modules: ModuleInfo[];
  edges: DepEdge[];
  entryPoints: string[];
}

export interface Boundary {
  name: string;
  modules: string[];
}

export interface HealthReport {
  score: number;
  issues: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTRY_POINT_PATTERNS: readonly RegExp[] = [
  /^index\./,
  /^main\./,
  /^app\./,
  /^server\./,
  /^cli\./,
  /^bin\./,
];

const GOD_MODULE_EXPORT_THRESHOLD = 50;
const DEEP_NEST_THRESHOLD = 4;

const SRC_DIRS: ReadonlySet<string> = new Set([
  "src",
  "lib",
  "app",
  "source",
  "sources",
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a topology graph from module info.
 *
 * Queries dependency edges via CodeGraph and detects entry points from
 * the given modules.
 */
export async function analyzeModules(
  projectDir: string,
  modules: ModuleInfo[],
): Promise<ModuleTopology> {
  const modulesCopy = structuredClone(modules);
  const edges = await getDependencies(projectDir);
  const entryPoints = identifyEntryPoints(modulesCopy);

  return {
    modules: modulesCopy,
    edges,
    entryPoints,
  };
}

/**
 * Group related files into module boundaries by their directory structure.
 *
 * Modules under the same top-level directory (e.g., `src/auth/`, `src/db/`)
 * form boundaries. A single file at root level belongs to a boundary named
 * "root".
 *
 * Returns boundaries deduplicated and sorted by name.
 */
export function identifyBoundaries(modules: ModuleInfo[]): Boundary[] {
  const boundaryMap = new Map<string, string[]>();

  for (const mod of modules) {
    const boundaryName = extractBoundaryName(mod.path);

    let members = boundaryMap.get(boundaryName);
    if (members === undefined) {
      members = [];
      boundaryMap.set(boundaryName, members);
    }
    members.push(mod.name);
  }

  const boundaries: Boundary[] = [];
  for (const [name, modNames] of boundaryMap) {
    boundaries.push({ name, modules: modNames });
  }

  boundaries.sort((a, b) => a.name.localeCompare(b.name));
  return boundaries;
}

/**
 * Extract public symbols that cross module boundaries.
 *
 * For each dependency edge that crosses a boundary, create an `ApiInfo`
 * entry where:
 * - `name` is the target symbol (module name)
 * - `route` is `"source → target"` (descriptive, not URL)
 * - `method` is `"export"` (cross-module symbol)
 * - `module` is the target's boundary name
 */
export function identifyCoreApis(topology: ModuleTopology): ApiInfo[] {
  const boundaries = identifyBoundaries(topology.modules);

  // Build module-name → boundary-name lookup
  const moduleBoundary = new Map<string, string>();
  for (const boundary of boundaries) {
    for (const modName of boundary.modules) {
      moduleBoundary.set(modName, boundary.name);
    }
  }

  const apis: ApiInfo[] = [];

  for (const edge of topology.edges) {
    const sourceBoundary = moduleBoundary.get(edge.source);
    const targetBoundary = moduleBoundary.get(edge.target);

    if (
      sourceBoundary !== undefined &&
      targetBoundary !== undefined &&
      sourceBoundary !== targetBoundary
    ) {
      apis.push({
        name: edge.target,
        route: `${edge.source} → ${edge.target}`,
        method: "export",
        module: targetBoundary,
      });
    }
  }

  return apis;
}

/**
 * Detect entry-point files by matching file basenames against common
 * patterns (`index.*`, `main.*`, `app.*`, `server.*`, `cli.*`, `bin.*`).
 *
 * Only considers files at depth 0 or 1 relative to project source
 * directories.
 */
export function identifyEntryPoints(modules: ModuleInfo[]): string[] {
  const entryPoints: string[] = [];

  for (const mod of modules) {
    for (const file of mod.files) {
      const basename = basenameOf(file);

      if (!matchesEntryPattern(basename)) {
        continue;
      }

      if (fileDepthAfterSrcDir(file) > 1) {
        continue;
      }

      entryPoints.push(file);
    }
  }

  return entryPoints;
}

/**
 * Assess the health of a module topology.
 *
 * Checks for:
 * - Circular dependencies (-20 each)
 * - God modules (>50 exports, -15 each)
 * - Orphan modules (no incoming or outgoing deps, -10 each)
 * - Deep-nested files (>4 directory levels deep, -5 each)
 *
 * Returns a score from 0–100 and a list of human-readable issue
 * descriptions.
 */
export function assessHealth(topology: ModuleTopology): HealthReport {
  let score = 100;
  const issues: string[] = [];

  // Circular dependencies
  const cycles = detectCycles(topology.edges);
  for (const cycle of cycles) {
    issues.push(`circular dependency: ${cycle}`);
    score -= 20;
  }

  // God modules
  const godModules = findGodModules(topology.modules);
  for (const mod of godModules) {
    issues.push(
      `god module "${mod}" has >${GOD_MODULE_EXPORT_THRESHOLD} exports`,
    );
    score -= 15;
  }

  // Orphan modules
  const orphans = findOrphanModules(topology);
  for (const mod of orphans) {
    issues.push(`orphan module "${mod}" has no incoming or outgoing dependencies`);
    score -= 10;
  }

  // Deep-nested files
  const deepFiles = findDeepNestedFiles(topology.modules);
  for (const file of deepFiles) {
    issues.push(
      `deep-nested file "${file}" is more than ${DEEP_NEST_THRESHOLD} levels deep`,
    );
    score -= 5;
  }

  return {
    score: Math.max(0, score),
    issues,
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Extract the boundary name from a module's relative path. */
function extractBoundaryName(modulePath: string): string {
  const parts = modulePath.split("/");
  const lastPart = parts[parts.length - 1];
  const hasExtension = /\.[^.]+$/.test(lastPart);

  if (SRC_DIRS.has(parts[0])) {
    if (parts.length >= 3) {
      // src/<boundary>/<...>
      return parts[1];
    }
    if (parts.length === 2) {
      // src/filename.ext → root (file at src root)
      // src/auth        → auth (directory module)
      if (hasExtension) {
        return "root";
      }
      return parts[1];
    }
    // parts.length === 1 → just "src" itself
    return "root";
  }

  // Not inside a well-known src dir
  if (parts.length >= 2) {
    return parts[0];
  }

  return "root";
}

/** Return the basename (final path component) of a file path. */
function basenameOf(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 1];
}

/** Check whether a basename matches any entry-point pattern. */
function matchesEntryPattern(basename: string): boolean {
  for (const pattern of ENTRY_POINT_PATTERNS) {
    if (pattern.test(basename)) {
      return true;
    }
  }
  return false;
}

/**
 * Compute the directory depth of a file after stripping the source
 * directory prefix.
 *
 * Examples:
 * - `src/index.ts`       → 0  (filename directly under src/)
 * - `src/utils/index.ts` → 1  (one subdirectory under src/)
 * - `src/a/b/index.ts`   → 2  (two subdirectories under src/)
 * - `index.ts`           → 0  (root level)
 * - `utils/index.ts`     → 1  (one level deep)
 */
function fileDepthAfterSrcDir(filePath: string): number {
  const parts = filePath.split("/");

  if (parts.length > 0 && SRC_DIRS.has(parts[0])) {
    return parts.length - 2; // subtract src dir and filename
  }

  return parts.length - 1; // subtract filename
}

// -- Circular dependency detection ----------------------------------------

/**
 * Detect cycles in a directed graph of module dependencies.
 *
 * Uses DFS with three-colour marking (white / gray / black).
 * Returns human-readable cycle descriptions.
 */
function detectCycles(edges: DepEdge[]): string[] {
  // Build adjacency list: module name → list of direct dependants it points to
  const adjacency = new Map<string, string[]>();
  const allModules = new Set<string>();

  for (const edge of edges) {
    allModules.add(edge.source);
    allModules.add(edge.target);

    let neighbours = adjacency.get(edge.source);
    if (neighbours === undefined) {
      neighbours = [];
      adjacency.set(edge.source, neighbours);
    }
    neighbours.push(edge.target);
  }

  const Color = {
    White: 0,
    Gray: 1,
    Black: 2,
  } as const;

  const colour = new Map<string, number>();
  for (const mod of allModules) {
    colour.set(mod, Color.White);
  }

  const cycles: string[] = [];

  /** DFS helper that records the current traversal stack to report cycles. */
  function dfs(node: string, stack: string[]): void {
    colour.set(node, Color.Gray);
    stack.push(node);

    const neighbours = adjacency.get(node) ?? [];

    for (const neighbour of neighbours) {
      // Self-loops are not meaningful cycles
      if (neighbour === node) continue;

      const neighbourColour = colour.get(neighbour) ?? Color.White;

      if (neighbourColour === Color.Gray) {
        // Found a back edge — extract the cycle portion
        const cycleStart = stack.indexOf(neighbour);
        if (cycleStart !== -1) {
          const cyclePath = stack.slice(cycleStart).concat(neighbour);
          cycles.push(cyclePath.join(" → "));
        }
      } else if (neighbourColour === Color.White) {
        dfs(neighbour, stack);
      }
      // Black nodes are already fully processed — ignore
    }

    stack.pop();
    colour.set(node, Color.Black);
  }

  for (const mod of allModules) {
    if (colour.get(mod) === Color.White) {
      dfs(mod, []);
    }
  }

  return cycles;
}

// -- God module detection --------------------------------------------------

/** Find modules whose export count exceeds the god-module threshold. */
function findGodModules(modules: ModuleInfo[]): string[] {
  const godModules: string[] = [];

  for (const mod of modules) {
    if (mod.exports.length > GOD_MODULE_EXPORT_THRESHOLD) {
      godModules.push(mod.name);
    }
  }

  return godModules;
}

// -- Orphan module detection -----------------------------------------------

/**
 * Find modules that have no incoming or outgoing dependencies in the
 * topology graph.
 */
function findOrphanModules(topology: ModuleTopology): string[] {
  const referenced = new Set<string>();

  for (const edge of topology.edges) {
    referenced.add(edge.source);
    referenced.add(edge.target);
  }

  const orphans: string[] = [];

  for (const mod of topology.modules) {
    if (!referenced.has(mod.name)) {
      orphans.push(mod.name);
    }
  }

  return orphans;
}

// -- Deep-nesting detection ------------------------------------------------

/**
 * Find files that are nested more than `DEEP_NEST_THRESHOLD` directory
 * levels deep under a source directory.
 */
function findDeepNestedFiles(modules: ModuleInfo[]): string[] {
  const deepFiles: string[] = [];

  for (const mod of modules) {
    for (const file of mod.files) {
      if (fileDepthAfterSrcDir(file) > DEEP_NEST_THRESHOLD) {
        deepFiles.push(file);
      }
    }
  }

  return deepFiles;
}
