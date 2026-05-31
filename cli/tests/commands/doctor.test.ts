import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

import { runDoctor, type DoctorResult } from "../../src/commands/doctor.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../src/integrations/codegraph.js", () => ({
  isInstalled: vi.fn(),
  isIndexed: vi.fn(),
}));

import { isInstalled, isIndexed } from "../../src/integrations/codegraph.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sdd-doctor-test-"));
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function initGitRepo(dir: string): void {
  fs.mkdirSync(path.join(dir, ".git"));
}

function writeConfig(dir: string, overrides?: Record<string, unknown>): void {
  const sddDir = path.join(dir, ".sdd-exoskeleton");
  fs.mkdirSync(sddDir, { recursive: true });

  const config = {
    version: "0.1.0",
    project: {
      name: "test-project",
      languages: ["typescript"],
      rootDir: dir,
      srcDir: "src",
    },
    codegraph: {
      indexPath: ".codegraph",
      mcpPort: 0,
    },
    openspec: {
      path: "openspec",
      changeDir: "openspec/changes",
    },
    obsidian: {
      vaultPath: "sdd-vault",
      strategy: "hybrid",
    },
    sync: {
      mode: "manual",
      lastSyncRef: "",
      lastSyncAt: "",
    },
    ...overrides,
  };

  fs.writeFileSync(
    path.join(sddDir, "config.json"),
    JSON.stringify(config, null, 2),
    "utf-8",
  );
}

function createOpenSpecDir(dir: string): void {
  const openspecDir = path.join(dir, "openspec");
  fs.mkdirSync(path.join(openspecDir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(openspecDir, "changes", "active"), { recursive: true });
  fs.mkdirSync(path.join(openspecDir, "changes", "archive"), { recursive: true });
  fs.mkdirSync(path.join(openspecDir, "schemas"), { recursive: true });

  // Create a spec
  fs.writeFileSync(path.join(openspecDir, "specs", "core.md"), "# Core\n", "utf-8");
  fs.writeFileSync(
    path.join(openspecDir, "specs", "auth.md"),
    "# Auth\n",
    "utf-8",
  );
}

function createVault(dir: string): void {
  const vaultPath = path.join(dir, "sdd-vault");
  fs.mkdirSync(path.join(vaultPath, "modules"), { recursive: true });
  fs.mkdirSync(path.join(vaultPath, "apis"), { recursive: true });
  fs.mkdirSync(path.join(vaultPath, "data"), { recursive: true });
  fs.mkdirSync(path.join(vaultPath, ".obsidian"), { recursive: true });

  // .obsidian/app.json
  fs.writeFileSync(
    path.join(vaultPath, ".obsidian", "app.json"),
    JSON.stringify({ vaultName: "sdd-vault" }),
    "utf-8",
  );

  // Some notes
  fs.writeFileSync(
    path.join(vaultPath, "modules", "core.md"),
    "# Core\n",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(vaultPath, "modules", "auth.md"),
    "# Auth\n",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(vaultPath, "apis", "users.md"),
    "# Users API\n",
    "utf-8",
  );
  fs.writeFileSync(path.join(vaultPath, "README.md"), "# Vault\n", "utf-8");
}

function createSyncState(dir: string): void {
  const sddDir = path.join(dir, ".sdd-exoskeleton");
  fs.mkdirSync(sddDir, { recursive: true });

  const state = {
    entries: {
      "src/index.ts": {
        lastHash: "abc123",
        lastSyncedAt: "2024-01-01T00:00:00Z",
        mappedSpecs: ["core"],
        mappedObsidianNodes: ["core"],
      },
      "src/utils/helpers.ts": {
        lastHash: "def456",
        lastSyncedAt: "2024-01-01T00:00:00Z",
        mappedSpecs: ["utils"],
        mappedObsidianNodes: ["utils"],
      },
    },
  };

  fs.writeFileSync(
    path.join(sddDir, "sync-state.json"),
    JSON.stringify(state, null, 2),
    "utf-8",
  );
}

function createClaudeMd(dir: string): void {
  fs.writeFileSync(
    path.join(dir, "CLAUDE.md"),
    "# test-project\n\nsdd-exoskeleton managed project",
    "utf-8",
  );
}

/**
 * Set up a "full" project with everything in place (all-ok scenario).
 */
function setupFullProject(dir: string): void {
  initGitRepo(dir);
  writeConfig(dir);
  createOpenSpecDir(dir);
  createVault(dir);
  createSyncState(dir);
  createClaudeMd(dir);

  // Also create the source files referenced by sync state
  fs.mkdirSync(path.join(dir, "src", "utils"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "index.ts"), "export {}", "utf-8");
  fs.writeFileSync(
    path.join(dir, "src", "utils", "helpers.ts"),
    "export {}",
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sdd doctor", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  // -- all-ok scenario ---------------------------------------------------------

  test("all checks pass when project is fully set up", async () => {
    setupFullProject(tmpDir);
    vi.mocked(isInstalled).mockResolvedValue(true);
    vi.mocked(isIndexed).mockResolvedValue(true);

    const result = await runDoctor(tmpDir);

    expect(result.failures).toBe(0);
    expect(result.warnings).toBe(0);
    expect(result.passed).toBe(10);
  });

  // -- missing git scenario ----------------------------------------------------

  test("reports failure when git repository is missing", async () => {
    setupFullProject(tmpDir);
    // Remove .git
    fs.rmSync(path.join(tmpDir, ".git"), { recursive: true, force: true });
    vi.mocked(isInstalled).mockResolvedValue(true);
    vi.mocked(isIndexed).mockResolvedValue(true);

    const result = await runDoctor(tmpDir);

    expect(result.failures).toBeGreaterThanOrEqual(1);
    expect(result.passed).toBeLessThan(10);
  });

  // -- missing CodeGraph scenario ----------------------------------------------

  test("reports warnings when CodeGraph is not installed and not indexed", async () => {
    setupFullProject(tmpDir);
    vi.mocked(isInstalled).mockResolvedValue(false);
    // isIndexed won't be called because isInstalled is false,
    // but we mock it anyway for safety
    vi.mocked(isIndexed).mockResolvedValue(false);

    const result = await runDoctor(tmpDir);

    expect(result.warnings).toBeGreaterThanOrEqual(2); // at least 2: not installed + not indexed
    expect(result.failures).toBe(0);
  });

  test("reports warning when CodeGraph is installed but not indexed", async () => {
    setupFullProject(tmpDir);
    vi.mocked(isInstalled).mockResolvedValue(true);
    vi.mocked(isIndexed).mockResolvedValue(false);

    const result = await runDoctor(tmpDir);

    expect(result.warnings).toBeGreaterThanOrEqual(1);
    // No failures expected — CodeGraph is optional
    expect(result.failures).toBe(0);
  });

  // -- invalid config scenario -------------------------------------------------

  test("reports failure when config is invalid (empty project name)", async () => {
    setupFullProject(tmpDir);
    // Overwrite config with invalid data (empty project name)
    writeConfig(tmpDir, { project: { name: "", languages: [], rootDir: "", srcDir: "" } });
    vi.mocked(isInstalled).mockResolvedValue(true);
    vi.mocked(isIndexed).mockResolvedValue(true);

    const result = await runDoctor(tmpDir);

    expect(result.failures).toBeGreaterThanOrEqual(1);
  });

  test("reports failure when config file contains invalid JSON", async () => {
    setupFullProject(tmpDir);
    const sddDir = path.join(tmpDir, ".sdd-exoskeleton");
    fs.writeFileSync(
      path.join(sddDir, "config.json"),
      "not valid {{{ json",
      "utf-8",
    );
    vi.mocked(isInstalled).mockResolvedValue(true);
    vi.mocked(isIndexed).mockResolvedValue(true);

    const result = await runDoctor(tmpDir);

    expect(result.failures).toBeGreaterThanOrEqual(1);
  });

  // -- missing OpenSpec scenario -----------------------------------------------

  test("reports warning when OpenSpec directory is missing", async () => {
    setupFullProject(tmpDir);
    fs.rmSync(path.join(tmpDir, "openspec"), { recursive: true, force: true });
    vi.mocked(isInstalled).mockResolvedValue(true);
    vi.mocked(isIndexed).mockResolvedValue(true);

    const result = await runDoctor(tmpDir);

    expect(result.warnings).toBeGreaterThanOrEqual(1);
    expect(result.failures).toBe(0);
  });

  // -- missing vault scenario --------------------------------------------------

  test("reports warning when Obsidian vault is missing", async () => {
    setupFullProject(tmpDir);
    fs.rmSync(path.join(tmpDir, "sdd-vault"), { recursive: true, force: true });
    vi.mocked(isInstalled).mockResolvedValue(true);
    vi.mocked(isIndexed).mockResolvedValue(true);

    const result = await runDoctor(tmpDir);

    expect(result.warnings).toBeGreaterThanOrEqual(1);
    expect(result.failures).toBe(0);
  });

  // -- missing sync state scenario ---------------------------------------------

  test("reports warnings when sync state is missing", async () => {
    setupFullProject(tmpDir);
    fs.rmSync(
      path.join(tmpDir, ".sdd-exoskeleton", "sync-state.json"),
      { force: true },
    );
    vi.mocked(isInstalled).mockResolvedValue(true);
    vi.mocked(isIndexed).mockResolvedValue(true);

    const result = await runDoctor(tmpDir);

    // Both sync state checks (present + consistent) should warn
    expect(result.warnings).toBeGreaterThanOrEqual(2);
    expect(result.failures).toBe(0);
  });

  // -- stale sync entries scenario ---------------------------------------------

  test("reports warning when sync state has stale entries", async () => {
    setupFullProject(tmpDir);
    // Remove one of the tracked files but keep the sync state entry
    fs.rmSync(path.join(tmpDir, "src", "utils", "helpers.ts"), { force: true });
    vi.mocked(isInstalled).mockResolvedValue(true);
    vi.mocked(isIndexed).mockResolvedValue(true);

    const result = await runDoctor(tmpDir);

    expect(result.warnings).toBeGreaterThanOrEqual(1);
    // failures === 0 because stale entries are a warning, not a failure
    expect(result.failures).toBe(0);
  });

  // -- missing CLAUDE.md scenario ----------------------------------------------

  test("reports warning when CLAUDE.md is missing", async () => {
    setupFullProject(tmpDir);
    fs.rmSync(path.join(tmpDir, "CLAUDE.md"), { force: true });
    vi.mocked(isInstalled).mockResolvedValue(true);
    vi.mocked(isIndexed).mockResolvedValue(true);

    const result = await runDoctor(tmpDir);

    expect(result.warnings).toBeGreaterThanOrEqual(1);
    expect(result.failures).toBe(0);
  });

  // -- edge: vault exists but .obsidian is missing ----------------------------

  test("reports warning when vault exists but .obsidian/ is missing", async () => {
    setupFullProject(tmpDir);
    fs.rmSync(
      path.join(tmpDir, "sdd-vault", ".obsidian"),
      { recursive: true, force: true },
    );
    vi.mocked(isInstalled).mockResolvedValue(true);
    vi.mocked(isIndexed).mockResolvedValue(true);

    const result = await runDoctor(tmpDir);

    expect(result.warnings).toBeGreaterThanOrEqual(1);
  });

  // -- edge: no .sdd-exoskeleton dir at all -----------------------------------

  test("handles project with no .sdd-exoskeleton directory gracefully", async () => {
    // Minimal project: just git repo, nothing else
    initGitRepo(tmpDir);
    vi.mocked(isInstalled).mockResolvedValue(false);
    vi.mocked(isIndexed).mockResolvedValue(false);

    const result = await runDoctor(tmpDir);

    // Should not throw; fail count should be low (git passes, rest warns/skips)
    expect(result.passed).toBeGreaterThanOrEqual(1); // at least git passes
    expect(result.warnings).toBeGreaterThanOrEqual(5); // most things warn
  });
});
