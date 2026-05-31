import { Command } from "commander";
import type { ChangedFile, SymbolChange } from "../sync/detector.js";
import { detectChanges, resolveSymbols, classifyChanges } from "../sync/detector.js";
import type { ImpactReport } from "../sync/impact.js";
import { analyzeImpact } from "../sync/impact.js";
import type { ConflictReport } from "../sync/delta.js";
import { generateDelta, updateSyncState, detectConflicts } from "../sync/delta.js";
import { getCurrentRef, isRepo } from "../utils/git.js";
import { loadConfig, saveConfig } from "../config.js";
import { startWatcher, stopWatcher } from "../sync/watcher.js";
import type { Watcher } from "../sync/watcher.js";
import {
  info,
  warn,
  error,
  success,
  step,
  dryRun as logDryRun,
  title,
} from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncOptions {
  since?: string;
  files?: string;
  dryRun?: boolean;
  watch?: boolean;
  resolve?: "code-first" | "spec-first" | "manual";
}

export interface SyncResult {
  changedFiles: number;
  changedSymbols: number;
  impactLevel: "low" | "medium" | "high";
  conflictReport: ConflictReport;
  deltaPath?: string;
  dryRun: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Match changed files against a list of file path patterns.
 * Simple substring matching: a file matches if any pattern is found
 * within its path.
 */
function matchFiles(changedFiles: readonly ChangedFile[], patterns: readonly string[]): ChangedFile[] {
  return changedFiles.filter((f) =>
    patterns.some((p) => f.path.includes(p)),
  );
}

/**
 * Build a minimal SyncResult for error cases where phases failed early.
 */
function buildEmptyResult(dryRun: boolean): SyncResult {
  return {
    changedFiles: 0,
    changedSymbols: 0,
    impactLevel: "low",
    conflictReport: { hasConflict: false, conflicts: [] },
    dryRun,
  };
}

// ---------------------------------------------------------------------------
// Public API — core sync runner (exported for testing)
// ---------------------------------------------------------------------------

export async function runSync(
  projectDir: string,
  options: SyncOptions,
): Promise<SyncResult> {
  const errors: string[] = [];

  // 1. Check git repo
  step("Checking git repository...");
  const gitRepoOk = await isRepo(projectDir);
  if (!gitRepoOk) {
    error("Not a git repository (or any of the parent directories).");
    process.exit(1);
  }
  success("Git repository detected");

  // Load config
  const config = loadConfig(projectDir);

  // Determine 'since' ref
  const since = options.since ?? config.sync.lastSyncRef;
  if (!since) {
    error(
      "No --since ref provided and no lastSyncRef in config. " +
        "Run a sync first or provide --since <ref>.",
    );
    process.exit(1);
  }

  // 2. Detect changes
  step("Detecting changes...");
  let changedFiles: ChangedFile[];
  try {
    changedFiles = await detectChanges(projectDir, since);
  } catch (err) {
    error(`Change detection failed: ${formatError(err)}`);
    process.exit(1);
  }

  // Filter by --files if provided
  if (options.files) {
    const patterns = options.files
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (patterns.length > 0) {
      changedFiles = matchFiles(changedFiles, patterns);
    }
  }

  // If no changes, exit cleanly
  if (changedFiles.length === 0) {
    info("Nothing to sync.");
    return buildEmptyResult(options.dryRun ?? false);
  }

  info(`Found ${changedFiles.length} changed file(s)`);

  // 3. Resolve symbols
  step("Resolving symbols...");
  let symbols: SymbolChange[];
  try {
    symbols = await resolveSymbols(changedFiles, projectDir);
  } catch (err) {
    errors.push(`Symbol resolution failed: ${formatError(err)}`);
    symbols = [];
  }
  info(`Resolved ${symbols.length} symbol change(s)`);

  // 4. Classify changes and log summary
  if (symbols.length > 0) {
    const classified = classifyChanges(symbols);
    info(`  Added: ${classified.added.length}`);
    info(`  Modified: ${classified.modified.length}`);
    info(`  Removed: ${classified.removed.length}`);
    info(`  Renamed: ${classified.renamed.length}`);
  }

  // 5. Analyze impact
  step("Analyzing impact...");
  let impact: ImpactReport;
  try {
    impact = await analyzeImpact(symbols, projectDir);
  } catch (err) {
    errors.push(`Impact analysis failed: ${formatError(err)}`);
    impact = {
      changes: [...symbols],
      affectedSpecs: [],
      affectedModules: [],
      summary: `Impact analysis failed: ${formatError(err)}`,
      impactLevel: "low",
    };
  }
  info(`Impact level: ${impact.impactLevel}`);
  info(impact.summary);

  // 6. Detect conflicts
  step("Checking for conflicts...");
  let conflictReport: ConflictReport;
  try {
    conflictReport = detectConflicts(impact, projectDir);
  } catch (err) {
    errors.push(`Conflict detection failed: ${formatError(err)}`);
    conflictReport = { hasConflict: false, conflicts: [] };
  }

  if (conflictReport.hasConflict) {
    warn(`Detected ${conflictReport.conflicts.length} conflict(s)`);
    for (const conflict of conflictReport.conflicts) {
      warn(`  - ${conflict.spec}: ${conflict.reason}`);
    }
    if (!options.resolve) {
      warn(
        "Use --resolve <strategy> to specify conflict resolution strategy " +
          "(code-first | spec-first | manual).",
      );
      return {
        changedFiles: changedFiles.length,
        changedSymbols: symbols.length,
        impactLevel: impact.impactLevel,
        conflictReport,
        dryRun: options.dryRun ?? false,
      };
    }
    info(`Conflict resolution strategy: ${options.resolve}`);
  }

  // 7. Dry run — report only, no writes
  if (options.dryRun) {
    logDryRun(impact.summary);
    logDryRun(
      `Would generate delta for ${symbols.length} symbol change(s) ` +
        `across ${impact.affectedModules.length} module(s).`,
    );
    return {
      changedFiles: changedFiles.length,
      changedSymbols: symbols.length,
      impactLevel: impact.impactLevel,
      conflictReport,
      dryRun: true,
    };
  }

  // 8. Generate delta
  step("Generating delta...");
  let deltaPath: string | undefined;
  try {
    deltaPath = generateDelta(impact, projectDir);
    success(`Delta generated at: ${deltaPath}`);
  } catch (err) {
    errors.push(`Delta generation failed: ${formatError(err)}`);
    warn("Delta generation failed. Continuing with remaining steps...");
  }

  // 9. Update sync state
  step("Updating sync state...");
  try {
    const currentRef = await getCurrentRef(projectDir);
    updateSyncState(projectDir, symbols, currentRef);

    // Also update config with new sync ref and timestamp
    const updatedConfig = {
      ...config,
      sync: {
        ...config.sync,
        lastSyncRef: currentRef,
        lastSyncAt: new Date().toISOString(),
      },
    };
    saveConfig(projectDir, updatedConfig);

    success("Sync state updated");
  } catch (err) {
    errors.push(`Sync state update failed: ${formatError(err)}`);
  }

  // 10. Print completion summary
  if (errors.length > 0) {
    warn(`Sync completed with ${errors.length} warning(s):`);
    for (const err of errors) {
      warn(`  - ${err}`);
    }
  } else {
    success(
      `Sync complete: ${symbols.length} symbol change(s) processed. ` +
        `Impact: ${impact.impactLevel}.`,
    );
  }

  return {
    changedFiles: changedFiles.length,
    changedSymbols: symbols.length,
    impactLevel: impact.impactLevel,
    conflictReport,
    deltaPath,
    dryRun: false,
  };
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function syncCommand(): Command {
  return new Command("sync")
    .description("Sync code changes to SDD specs and Obsidian vault")
    .option(
      "--since <ref>",
      "git ref to diff from (default: last sync ref from config)",
    )
    .option(
      "--files <glob>",
      "only sync specific files (comma-separated)",
    )
    .option(
      "--dry-run",
      "detect + analyze + report without writing",
    )
    .option(
      "--watch",
      "start file watcher for continuous sync",
    )
    .option(
      "--resolve <strategy>",
      "conflict resolution: code-first | spec-first | manual",
    )
    .action(async (opts: SyncOptions) => {
      const projectDir = process.cwd();

      if (opts.watch) {
        // --watch mode: continuous file watcher
        title("Starting continuous sync watcher...");
        info("Press Ctrl+C to stop.");

        let running = true;

        const onSync = async (files: string[]): Promise<void> => {
          try {
            const result = await runSync(projectDir, {
              ...opts,
              files: files.join(","),
            });
            const timestamp = new Date().toISOString();
            info(`[${timestamp}] Synced ${result.changedSymbols} change(s)`);
          } catch (err) {
            error(
              `Sync watcher error: ${formatError(err)}`,
            );
          }
        };

        const watcher: Watcher = startWatcher(projectDir, (f) => {
          void onSync(f);
        });

        const shutdown = (): void => {
          if (running) {
            running = false;
            info("\nStopping watcher...");
            stopWatcher(watcher)
              .then(() => {
                success("Watcher stopped.");
                process.exit(0);
              })
              .catch(() => {
                process.exit(0);
              });
          }
        };

        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);

        // Keep process alive indefinitely
        await new Promise<void>(() => {
          /* never resolves; lives until SIGINT / SIGTERM */
        });
        return;
      }

      // Non-watch mode: single sync run
      try {
        const result = await runSync(projectDir, opts);

        if (result.dryRun) {
          logDryRun(
            `Impact: ${result.impactLevel}. ${result.changedSymbols} change(s) would be synced.`,
          );
        }

        if (result.conflictReport.hasConflict && !opts.resolve) {
          process.exit(0);
        }
      } catch (err) {
        error(`Sync failed: ${formatError(err)}`);
        process.exit(1);
      }
    });
}
