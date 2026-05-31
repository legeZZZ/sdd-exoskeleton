import * as path from "node:path";
import type { SymbolChange } from "./detector.js";
import { loadSyncState } from "../sync-state.js";
import { safeRead, listDir } from "../utils/fs.js";

export interface ImpactReport {
  changes: SymbolChange[];
  affectedSpecs: string[];
  affectedModules: string[];
  summary: string;
  impactLevel: "low" | "medium" | "high";
}

/**
 * Compute the impact level for a single symbol change.
 *
 * - "high": symbol name starts with uppercase (class/interface = public API),
 *   OR the symbol affects more than 3 modules
 * - "medium": symbol affects 1–3 modules
 * - "low": symbol only affects its own module (0 affectedModules)
 */
export function computeImpactLevel(
  symbol: SymbolChange,
): "low" | "medium" | "high" {
  const startsWithUppercase = symbol.name.length > 0 && symbol.name[0] === symbol.name[0].toUpperCase();

  if (startsWithUppercase) {
    return "high";
  }

  if (symbol.affectedModules.length > 3) {
    return "high";
  }

  if (symbol.affectedModules.length >= 1) {
    return "medium";
  }

  return "low";
}

/**
 * Find OpenSpec spec files that reference the given symbol's module.
 *
 * Searches:
 * 1. `openspec/specs/modules/` for .md files whose content mentions the module name.
 * 2. The project's sync-state.json entries for `mappedSpecs`.
 */
export function mapToSpecs(
  symbol: SymbolChange,
  projectDir: string,
): string[] {
  const specPaths: string[] = [];

  // Check sync-state.json for mappedSpecs on this module
  const syncState = loadSyncState(projectDir);
  const moduleEntry = syncState.entries[symbol.module];
  if (moduleEntry && moduleEntry.mappedSpecs.length > 0) {
    specPaths.push(...moduleEntry.mappedSpecs);
  }

  // Scan openspec/specs/modules/ for .md files referencing the module name
  const modulesDir = path.join(projectDir, "openspec", "specs", "modules");
  const dirEntries = listDir(modulesDir);
  const mdFiles = dirEntries.filter((entry) => entry.endsWith(".md"));

  for (const mdFile of mdFiles) {
    const fullPath = path.join(modulesDir, mdFile);
    const content = safeRead(fullPath);
    if (content !== null && content.toLowerCase().includes(symbol.module.toLowerCase())) {
      specPaths.push(mdFile);
    }
  }

  // Deduplicate and sort
  return [...new Set(specPaths)].sort();
}

/** Impact level ordering for computing the maximum level. */
const IMPACT_ORDER: Record<ImpactReport["impactLevel"], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/**
 * Compute the maximum impact level from a collection of individual symbols.
 */
function maxImpact(
  symbols: SymbolChange[],
): "low" | "medium" | "high" {
  let max: "low" | "medium" | "high" = "low";

  for (const symbol of symbols) {
    const level = computeImpactLevel(symbol);
    if (IMPACT_ORDER[level] > IMPACT_ORDER[max]) {
      max = level;
    }
  }

  return max;
}

/**
 * Generate a human-readable summary for the impact report.
 */
function buildSummary(
  level: "low" | "medium" | "high",
  changes: SymbolChange[],
  affectedModules: string[],
  affectedSpecs: string[],
): string {
  if (changes.length === 0) {
    return "No changes detected.";
  }

  const changeCount = changes.length;
  const moduleCount = affectedModules.length;
  const specCount = affectedSpecs.length;

  switch (level) {
    case "high":
      return `High impact: ${changeCount} symbol change(s) across ${moduleCount} module(s). ${specCount} spec(s) potentially affected.`;
    case "medium":
      return `Medium impact: ${changeCount} symbol change(s) across ${moduleCount} module(s). ${specCount} spec(s) potentially affected.`;
    case "low":
      return `Low impact: ${changeCount} symbol change(s) across ${moduleCount} module(s). ${specCount} spec(s) potentially affected.`;
  }
}

/**
 * Analyze the impact of a set of symbol changes on the project.
 *
 * Computes an overall impact level, deduplicated and sorted lists of affected
 * specs and modules, and a human-readable summary.
 */
export async function analyzeImpact(
  symbols: SymbolChange[],
  projectDir: string,
): Promise<ImpactReport> {
  const level = maxImpact(symbols);

  // Collect all affected modules (from symbol.module)
  const affectedModules = [
    ...new Set(
      symbols
        .map((s) => s.module)
        .filter((m) => m.length > 0),
    ),
  ].sort();

  // Collect all affected specs by mapping each symbol
  const allSpecs: string[] = [];
  for (const symbol of symbols) {
    const specs = mapToSpecs(symbol, projectDir);
    allSpecs.push(...specs);
  }
  const affectedSpecs = [...new Set(allSpecs)].sort();

  const summary = buildSummary(level, symbols, affectedModules, affectedSpecs);

  // Never mutate the input — return a new array
  return {
    changes: [...symbols],
    affectedSpecs,
    affectedModules,
    summary,
    impactLevel: level,
  };
}
