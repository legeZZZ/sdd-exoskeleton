import { Command } from "commander";
import { loadConfig } from "../config.js";
import type { SddConfig } from "../config.js";
import { loadSyncState } from "../sync-state.js";
import type { SyncState } from "../sync-state.js";
import { isInstalled, isIndexed } from "../integrations/codegraph.js";
import { listDir } from "../utils/fs.js";
import * as path from "node:path";
import * as fs from "node:fs";
import { info, success, warn, title } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatusResult {
  project: {
    name: string;
    languages: string[];
    srcDir: string;
    vaultStrategy: string;
  };
  codegraph: {
    installed: boolean;
    indexed: boolean;
    indexSize: number;
  };
  openspec: {
    specsCount: number;
    activeChanges: number;
    schemasCount: number;
  };
  sync: {
    lastRef: string;
    lastAt: string;
    trackedFiles: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BYTES_UNITS: readonly string[] = ["B", "KB", "MB", "GB"];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${BYTES_UNITS[i]}`;
}

function getIndexSize(projectDir: string, indexPath: string): number {
  const cgDir = path.join(projectDir, indexPath);
  if (!fs.existsSync(cgDir)) return 0;

  const walk = (dir: string): number => {
    let total = 0;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return total;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        total += walk(fullPath);
      } else {
        try {
          total += fs.statSync(fullPath).size;
        } catch {
          // skip unreadable files
        }
      }
    }
    return total;
  };

  return walk(cgDir);
}

function countSpecFiles(basePath: string): number {
  return listDir(basePath).filter((f) => f.endsWith(".md")).length;
}

function countActiveChangeDirs(basePath: string): number {
  try {
    return fs
      .readdirSync(basePath, { withFileTypes: true })
      .filter((e) => e.isDirectory()).length;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }
}

function resolveSyncInfo(
  config: SddConfig,
  syncState: SyncState,
): { lastRef: string; lastAt: string } {
  let lastRef = config.sync.lastSyncRef || "";
  let lastAt = config.sync.lastSyncAt || "";

  if (!lastRef || !lastAt) {
    const entries = Object.values(syncState.entries);
    if (entries.length > 0) {
      let latestEntry = entries[0];
      for (const entry of entries) {
        if (entry.lastSyncedAt > latestEntry.lastSyncedAt) {
          latestEntry = entry;
        }
      }
      if (!lastAt) lastAt = latestEntry.lastSyncedAt;
    }
    if (!lastRef) lastRef = "";
  }

  return {
    lastRef: lastRef || "(never)",
    lastAt: lastAt || "(never)",
  };
}

// ---------------------------------------------------------------------------
// Public API — core status gatherer (exported for testing)
// ---------------------------------------------------------------------------

export async function runStatus(projectDir: string): Promise<StatusResult> {
  const resolvedDir = path.resolve(projectDir);
  const config = loadConfig(resolvedDir);
  const syncState = loadSyncState(resolvedDir);

  const codegraphInstalled = await isInstalled();
  const codegraphIndexed = await isIndexed(resolvedDir);
  const indexSize = getIndexSize(resolvedDir, config.codegraph.indexPath);

  const specsDir = path.join(resolvedDir, config.openspec.path, "specs");
  const activeDir = path.join(resolvedDir, config.openspec.path, "changes", "active");
  const schemasDir = path.join(resolvedDir, config.openspec.path, "schemas");

  const specsCount = countSpecFiles(specsDir);
  const activeChanges = countActiveChangeDirs(activeDir);
  const schemasCount = countSpecFiles(schemasDir);

  const trackedFiles = Object.keys(syncState.entries).length;
  const { lastRef, lastAt } = resolveSyncInfo(config, syncState);

  return {
    project: {
      name: config.project.name,
      languages: config.project.languages,
      srcDir: config.project.srcDir,
      vaultStrategy: config.obsidian.strategy,
    },
    codegraph: {
      installed: codegraphInstalled,
      indexed: codegraphIndexed,
      indexSize,
    },
    openspec: {
      specsCount,
      activeChanges,
      schemasCount,
    },
    sync: {
      lastRef,
      lastAt,
      trackedFiles,
    },
  };
}

function renderPretty(result: StatusResult): void {
  const { project, codegraph, openspec, sync } = result;

  // 1. Title
  title(`SDD Status: ${project.name || "(unconfigured)"}`);

  // 2. Project Info
  info("\nProject:");
  info(`  Name:      ${project.name || "(not set)"}`);
  info(`  Languages: ${project.languages.join(", ") || "(none)"}`);
  info(`  Src Dir:   ${project.srcDir || "(not set)"}`);
  info(`  Vault:     ${project.vaultStrategy}`);

  // 3. CodeGraph
  info("\nCodeGraph:");
  (codegraph.installed ? success : warn)(`  Installed: ${codegraph.installed ? "✓" : "✗"}`);
  (codegraph.indexed ? success : warn)(`  Indexed:   ${codegraph.indexed ? "✓" : "✗"}`);
  info(`  Index:     ${formatBytes(codegraph.indexSize)}`);

  // 4. OpenSpec
  info("\nOpenSpec:");
  info(`  Specs:         ${openspec.specsCount}`);
  info(`  Active Changes: ${openspec.activeChanges}`);
  info(`  Schemas:        ${openspec.schemasCount}`);

  // 5. Sync
  info("\nSync:");
  info(`  Last Ref:      ${sync.lastRef}`);
  info(`  Last Sync:     ${sync.lastAt}`);
  info(`  Tracked Files: ${sync.trackedFiles}`);

  // 6. Summary
  const issues: string[] = [];
  if (!codegraph.installed) issues.push("CodeGraph not installed");
  if (codegraph.installed && !codegraph.indexed) issues.push("not indexed");
  if (sync.trackedFiles === 0) issues.push("no tracked files");
  if (openspec.specsCount === 0) issues.push("no specs");

  if (issues.length === 0) {
    success("\nAll systems healthy.");
  } else {
    warn(`\nIssues: ${issues.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function statusCommand(): Command {
  return new Command("status")
    .description("Show project SDD status")
    .option("--json", "Output as machine-readable JSON")
    .argument("[directory]", "Project directory", process.cwd())
    .action(async (directory: string, options: { json?: boolean }) => {
      const result = await runStatus(directory);

      if (options.json) {
        // Machine-readable: plain JSON (no chalk formatting)
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        return;
      }

      renderPretty(result);
    });
}
