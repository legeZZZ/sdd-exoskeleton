import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";
import { loadConfig, validateConfig } from "../config.js";
import { loadSyncState } from "../sync-state.js";
import { isInstalled, isIndexed } from "../integrations/codegraph.js";
import { isRepo } from "../utils/git.js";
import { listDir } from "../utils/fs.js";
import { info, title } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Icon helpers
// ---------------------------------------------------------------------------

function ok(msg: string): string {
  return `✓ ${msg}`;
}

function fail(msg: string): string {
  return `✗ ${msg}`;
}

function maybe(msg: string): string {
  return `⚠ ${msg}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DoctorResult {
  passed: number;
  warnings: number;
  failures: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function indentPrint(line: string): void {
  info(`  ${line}`);
}

/** Count .md files recursively, skipping .obsidian/ and templates/ dirs. */
function countVaultNotes(vaultPath: string): number {
  let count = 0;
  const subdirs = ["modules", "apis", "data", "journal", "decisions"];
  for (const sub of subdirs) {
    const subPath = path.join(vaultPath, sub);
    if (fs.existsSync(subPath)) {
      const entries = listDir(subPath);
      count += entries.filter((f) => f.endsWith(".md")).length;
    }
  }
  // Also count .md files at vault root (like README.md)
  const rootEntries = listDir(vaultPath);
  count += rootEntries.filter((f) => f.endsWith(".md")).length;
  return count;
}

/** Resolve vault path from config, falling back to default. */
function resolveVaultPath(rootDir: string): string {
  try {
    const config = loadConfig(rootDir);
    const configured = config.obsidian.vaultPath;
    return path.isAbsolute(configured)
      ? configured
      : path.join(rootDir, configured);
  } catch {
    return path.join(rootDir, "sdd-vault");
  }
}

// ---------------------------------------------------------------------------
// Core logic (exported for testing)
// ---------------------------------------------------------------------------

export async function runDoctor(projectDir: string): Promise<DoctorResult> {
  const resolved = path.resolve(projectDir);
  let passed = 0;
  let warnings = 0;
  let failures = 0;

  title(`SDD Doctor — ${resolved}`);

  info("Checks:");

  // 1. Git repo check
  const repo = await isRepo(resolved);
  if (repo) {
    indentPrint(ok("Git repository detected"));
    passed++;
  } else {
    indentPrint(fail("Git repository not detected"));
    failures++;
  }

  // 2. CodeGraph installed
  const cgInstalled = await isInstalled();
  if (cgInstalled) {
    indentPrint(ok("CodeGraph installed"));
    passed++;
  } else {
    indentPrint(
      maybe(
        "CodeGraph not installed (optional) — install @colbymchenry/codegraph",
      ),
    );
    warnings++;
  }

  // 3. CodeGraph indexed
  if (cgInstalled) {
    const indexed = await isIndexed(resolved);
    if (indexed) {
      indentPrint(ok("CodeGraph index found"));
      passed++;
    } else {
      indentPrint(
        maybe("CodeGraph index not found — run 'sdd init' first"),
      );
      warnings++;
    }
  } else {
    indentPrint(
      maybe("CodeGraph index check skipped (CodeGraph not installed)"),
    );
    warnings++;
  }

  // 4. Config valid
  try {
    const config = loadConfig(resolved);
    const issues = validateConfig(config);
    if (issues.length === 0) {
      indentPrint(ok("Config valid"));
      passed++;
    } else {
      indentPrint(fail(`Config invalid: ${issues.join("; ")}`));
      failures++;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    indentPrint(fail(`Config invalid: ${message}`));
    failures++;
  }

  // 5. OpenSpec dir exists
  const openspecDir = path.join(resolved, "openspec");
  if (fs.existsSync(openspecDir)) {
    const specCount = listDir(path.join(openspecDir, "specs")).length;
    indentPrint(ok(`OpenSpec directory exists (${specCount} specs)`));
    passed++;
  } else {
    indentPrint(
      maybe("OpenSpec directory not found — run 'sdd init' first"),
    );
    warnings++;
  }

  // 6. Obsidian vault exists
  const vaultPath = resolveVaultPath(resolved);
  const hasVault =
    fs.existsSync(vaultPath) &&
    fs.existsSync(path.join(vaultPath, ".obsidian"));
  if (hasVault) {
    const noteCount = countVaultNotes(vaultPath);
    indentPrint(ok(`Obsidian vault found (${noteCount} notes)`));
    passed++;
  } else {
    indentPrint(
      maybe("Obsidian vault not found — run 'sdd init' first"),
    );
    warnings++;
  }

  // 7. Sync state present
  let syncStateExists = false;
  const syncStatePath = path.join(resolved, ".sdd-exoskeleton", "sync-state.json");
  if (fs.existsSync(syncStatePath)) {
    syncStateExists = true;
    const syncState = loadSyncState(resolved);
    const trackCount = Object.keys(syncState.entries).length;
    indentPrint(ok(`Sync state present (${trackCount} files tracked)`));
    passed++;
  } else {
    indentPrint(
      maybe("Sync state not found — run 'sdd init' first"),
    );
    warnings++;
  }

  // 8. Sync state consistency check (depends on #7)
  if (syncStateExists) {
    const syncState = loadSyncState(resolved);
    let staleCount = 0;
    for (const fileKey of Object.keys(syncState.entries)) {
      const absPath = path.join(resolved, fileKey);
      if (!fs.existsSync(absPath)) {
        staleCount++;
      }
    }
    if (staleCount === 0) {
      indentPrint(ok("Sync state consistent"));
      passed++;
    } else {
      indentPrint(
        maybe(`${staleCount} stale sync entries — run 'sdd sync' to update`),
      );
      warnings++;
    }
  } else {
    indentPrint(
      maybe("Sync state consistency check skipped (no sync state)"),
    );
    warnings++;
  }

  // 9. CLAUDE.md present
  const claudePath = path.join(resolved, "CLAUDE.md");
  if (fs.existsSync(claudePath)) {
    indentPrint(ok("CLAUDE.md present"));
    passed++;
  } else {
    indentPrint(
      maybe("CLAUDE.md not found — run 'sdd init' to generate"),
    );
    warnings++;
  }

  // 10. File permissions: check .sdd-exoskeleton/ is writable
  const sddDir = path.join(resolved, ".sdd-exoskeleton");
  try {
    if (!fs.existsSync(sddDir)) {
      fs.mkdirSync(sddDir, { recursive: true });
    }
    const testFile = path.join(sddDir, ".doctor-write-test");
    fs.writeFileSync(testFile, "test", "utf-8");
    fs.rmSync(testFile);
    indentPrint(ok(".sdd-exoskeleton/ is writable"));
    passed++;
  } catch {
    indentPrint(fail(".sdd-exoskeleton/ is not writable"));
    failures++;
  }

  // Summary
  info(`\nSummary: ${passed} passed, ${warnings} warnings, ${failures} failures`);

  return { passed, warnings, failures };
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function doctorCommand(): Command {
  return new Command("doctor")
    .description("Diagnose SDD Exoskeleton integration status")
    .action(async () => {
      const result = await runDoctor(process.cwd());
      if (result.failures > 0) {
        process.exitCode = 1;
      }
    });
}
