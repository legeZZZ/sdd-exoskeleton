import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

import { runStatus } from "../../src/commands/status.js";
import type { StatusResult } from "../../src/commands/status.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../src/integrations/codegraph.js", () => ({
  isInstalled: vi.fn(),
  isIndexed: vi.fn(),
}));

import { isInstalled, isIndexed } from "../../src/integrations/codegraph.js";

const mockedIsInstalled = vi.mocked(isInstalled);
const mockedIsIndexed = vi.mocked(isIndexed);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockProjectOptions {
  projectName?: string;
  languages?: string[];
  srcDir?: string;
  vaultStrategy?: string;
  withSyncState?: boolean;
  syncEntries?: Record<string, { lastHash: string; lastSyncedAt: string }>;
  lastSyncRef?: string;
  lastSyncAt?: string;
  withSpecs?: boolean;
  specFiles?: string[];
  withActiveChanges?: boolean;
  activeChangeNames?: string[];
  withSchemas?: boolean;
  schemaFiles?: string[];
  withCodegraphIndex?: boolean;
}

function createMockProject(overrides: MockProjectOptions = {}): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-status-test-"));
  const sddDir = path.join(tmpDir, ".sdd-exoskeleton");
  fs.mkdirSync(sddDir, { recursive: true });

  // Write config
  const config = {
    version: "0.1.0",
    project: {
      name: overrides.projectName ?? "test-project",
      languages: overrides.languages ?? ["typescript"],
      rootDir: tmpDir,
      srcDir: overrides.srcDir ?? "src",
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
      strategy: overrides.vaultStrategy ?? "hybrid",
    },
    sync: {
      mode: "manual",
      lastSyncRef: overrides.lastSyncRef ?? "abc123",
      lastSyncAt: overrides.lastSyncAt ?? "2024-01-15T10:30:00Z",
    },
  };

  fs.writeFileSync(
    path.join(sddDir, "config.json"),
    JSON.stringify(config, null, 2),
  );

  // Write sync state (optional)
  if (overrides.withSyncState !== false) {
    const defaultEntries: Record<string, { lastHash: string; lastSyncedAt: string }> =
      overrides.syncEntries ?? {
        "src/index.ts": { lastHash: "aaa111", lastSyncedAt: "2024-01-15T10:30:00Z" },
        "src/utils.ts": { lastHash: "bbb222", lastSyncedAt: "2024-01-15T10:29:00Z" },
      };

    const entries: Record<string, { lastHash: string; lastSyncedAt: string; mappedSpecs: string[]; mappedObsidianNodes: string[] }> = {};
    for (const [filePath, entry] of Object.entries(defaultEntries)) {
      entries[filePath] = {
        lastHash: entry.lastHash,
        lastSyncedAt: entry.lastSyncedAt,
        mappedSpecs: [],
        mappedObsidianNodes: [],
      };
    }

    fs.writeFileSync(
      path.join(sddDir, "sync-state.json"),
      JSON.stringify({ entries }, null, 2),
    );
  }

  // OpenSpec dirs (optional)
  if (overrides.withSpecs !== false) {
    const specsDir = path.join(tmpDir, "openspec", "specs");
    fs.mkdirSync(specsDir, { recursive: true });
    const files = overrides.specFiles ?? ["auth.md", "users.md"];
    for (const file of files) {
      fs.writeFileSync(path.join(specsDir, file), "# Spec\n");
    }
  }

  if (overrides.withActiveChanges !== false) {
    const activeDir = path.join(tmpDir, "openspec", "changes", "active");
    fs.mkdirSync(activeDir, { recursive: true });
    const changes = overrides.activeChangeNames ?? ["add-login"];
    for (const change of changes) {
      fs.mkdirSync(path.join(activeDir, change), { recursive: true });
      fs.writeFileSync(
        path.join(activeDir, change, "proposal.md"),
        "# Change\n",
      );
    }
  }

  if (overrides.withSchemas !== false) {
    const schemasDir = path.join(tmpDir, "openspec", "schemas");
    fs.mkdirSync(schemasDir, { recursive: true });
    const files = overrides.schemaFiles ?? ["users.md"];
    for (const file of files) {
      fs.writeFileSync(path.join(schemasDir, file), "# Schema\n");
    }
  }

  // CodeGraph index (optional)
  if (overrides.withCodegraphIndex === true) {
    const cgDir = path.join(tmpDir, ".codegraph");
    fs.mkdirSync(cgDir, { recursive: true });
    fs.writeFileSync(path.join(cgDir, "index.json"), JSON.stringify({ modules: [] }));
  }

  return tmpDir;
}

function cleanupProject(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sdd status", () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsInstalled.mockResolvedValue(true);
    mockedIsIndexed.mockResolvedValue(true);
  });

  afterEach(() => {
    if (tmpDir) cleanupProject(tmpDir);
  });

  // -- Basic status output ------------------------------------------------------

  test("returns project info from config", async () => {
    tmpDir = createMockProject({
      projectName: "my-app",
      languages: ["typescript", "javascript"],
      srcDir: "lib",
      vaultStrategy: "embedded",
    });

    const result = await runStatus(tmpDir);

    expect(result.project.name).toBe("my-app");
    expect(result.project.languages).toEqual(["typescript", "javascript"]);
    expect(result.project.srcDir).toBe("lib");
    expect(result.project.vaultStrategy).toBe("embedded");
  });

  test("reports codegraph installed and indexed", async () => {
    mockedIsInstalled.mockResolvedValue(true);
    mockedIsIndexed.mockResolvedValue(true);
    tmpDir = createMockProject({ withCodegraphIndex: true });

    const result = await runStatus(tmpDir);

    expect(result.codegraph.installed).toBe(true);
    expect(result.codegraph.indexed).toBe(true);
    expect(result.codegraph.indexSize).toBeGreaterThan(0);
  });

  test("reports codegraph not installed", async () => {
    mockedIsInstalled.mockResolvedValue(false);
    mockedIsIndexed.mockResolvedValue(false);
    tmpDir = createMockProject();

    const result = await runStatus(tmpDir);

    expect(result.codegraph.installed).toBe(false);
    expect(result.codegraph.indexed).toBe(false);
    expect(result.codegraph.indexSize).toBe(0);
  });

  test("returns empty index size when no codegraph directory", async () => {
    mockedIsIndexed.mockResolvedValue(false);
    tmpDir = createMockProject({ withCodegraphIndex: false });

    const result = await runStatus(tmpDir);

    expect(result.codegraph.indexSize).toBe(0);
  });

  // -- OpenSpec counts ----------------------------------------------------------

  test("counts spec files correctly", async () => {
    tmpDir = createMockProject({
      specFiles: ["auth.md", "users.md", "payments.md"],
    });

    const result = await runStatus(tmpDir);

    expect(result.openspec.specsCount).toBe(3);
  });

  test("returns zero specs when dir does not exist", async () => {
    tmpDir = createMockProject({ withSpecs: false });

    const result = await runStatus(tmpDir);

    expect(result.openspec.specsCount).toBe(0);
  });

  test("counts active changes correctly", async () => {
    tmpDir = createMockProject({
      activeChangeNames: ["add-oauth", "fix-login", "new-dashboard"],
    });

    const result = await runStatus(tmpDir);

    expect(result.openspec.activeChanges).toBe(3);
  });

  test("returns zero active changes when dir does not exist", async () => {
    tmpDir = createMockProject({ withActiveChanges: false });

    const result = await runStatus(tmpDir);

    expect(result.openspec.activeChanges).toBe(0);
  });

  test("counts schema files correctly", async () => {
    tmpDir = createMockProject({
      schemaFiles: ["users.md", "sessions.md", "products.md"],
    });

    const result = await runStatus(tmpDir);

    expect(result.openspec.schemasCount).toBe(3);
  });

  test("returns zero schemas when dir does not exist", async () => {
    tmpDir = createMockProject({ withSchemas: false });

    const result = await runStatus(tmpDir);

    expect(result.openspec.schemasCount).toBe(0);
  });

  // -- Sync state ---------------------------------------------------------------

  test("reports sync info from config", async () => {
    tmpDir = createMockProject({
      lastSyncRef: "def456",
      lastSyncAt: "2024-02-20T14:00:00Z",
    });

    const result = await runStatus(tmpDir);

    expect(result.sync.lastRef).toBe("def456");
    expect(result.sync.lastAt).toBe("2024-02-20T14:00:00Z");
  });

  test("counts tracked files from sync state", async () => {
    tmpDir = createMockProject({
      syncEntries: {
        "src/a.ts": { lastHash: "h1", lastSyncedAt: "2024-01-01T00:00:00Z" },
        "src/b.ts": { lastHash: "h2", lastSyncedAt: "2024-01-01T00:00:00Z" },
        "src/c.ts": { lastHash: "h3", lastSyncedAt: "2024-01-01T00:00:00Z" },
      },
    });

    const result = await runStatus(tmpDir);

    expect(result.sync.trackedFiles).toBe(3);
  });

  test("returns zero tracked files with empty sync state", async () => {
    tmpDir = createMockProject({ withSyncState: true, syncEntries: {} });

    const result = await runStatus(tmpDir);

    expect(result.sync.trackedFiles).toBe(0);
  });

  test("falls back to (never) when no sync info", async () => {
    tmpDir = createMockProject({
      lastSyncRef: "",
      lastSyncAt: "",
      withSyncState: true,
      syncEntries: {},
    });

    const result = await runStatus(tmpDir);

    expect(result.sync.lastRef).toBe("(never)");
    expect(result.sync.lastAt).toBe("(never)");
  });

  test("falls back to sync state entries when config has no sync info", async () => {
    tmpDir = createMockProject({
      lastSyncRef: "",
      lastSyncAt: "",
      syncEntries: {
        "src/x.ts": { lastHash: "hhh", lastSyncedAt: "2024-06-01T12:00:00Z" },
        "src/y.ts": { lastHash: "iii", lastSyncedAt: "2024-05-01T12:00:00Z" },
      },
    });

    const result = await runStatus(tmpDir);

    // Should use most recent from sync state entries
    expect(result.sync.lastAt).toBe("2024-06-01T12:00:00Z");
    expect(result.sync.lastRef).toBe("(never)");
  });

  test("returns zero tracked files when sync state is missing", async () => {
    tmpDir = createMockProject({ withSyncState: false });

    const result = await runStatus(tmpDir);

    expect(result.sync.trackedFiles).toBe(0);
  });

  // -- JSON output structure ----------------------------------------------------

  test("JSON output has correct shape", async () => {
    tmpDir = createMockProject();

    const result = await runStatus(tmpDir);

    // Verify top-level keys
    expect(result).toHaveProperty("project");
    expect(result).toHaveProperty("codegraph");
    expect(result).toHaveProperty("openspec");
    expect(result).toHaveProperty("sync");

    // Verify nested keys
    expect(result.project).toHaveProperty("name");
    expect(result.project).toHaveProperty("languages");
    expect(result.project).toHaveProperty("srcDir");
    expect(result.project).toHaveProperty("vaultStrategy");

    expect(result.codegraph).toHaveProperty("installed");
    expect(result.codegraph).toHaveProperty("indexed");
    expect(result.codegraph).toHaveProperty("indexSize");

    expect(result.openspec).toHaveProperty("specsCount");
    expect(result.openspec).toHaveProperty("activeChanges");
    expect(result.openspec).toHaveProperty("schemasCount");

    expect(result.sync).toHaveProperty("lastRef");
    expect(result.sync).toHaveProperty("lastAt");
    expect(result.sync).toHaveProperty("trackedFiles");
  });

  test("JSON output types are correct", async () => {
    tmpDir = createMockProject();

    const result = await runStatus(tmpDir);

    expect(typeof result.project.name).toBe("string");
    expect(Array.isArray(result.project.languages)).toBe(true);
    expect(typeof result.project.srcDir).toBe("string");
    expect(typeof result.project.vaultStrategy).toBe("string");

    expect(typeof result.codegraph.installed).toBe("boolean");
    expect(typeof result.codegraph.indexed).toBe("boolean");
    expect(typeof result.codegraph.indexSize).toBe("number");

    expect(typeof result.openspec.specsCount).toBe("number");
    expect(typeof result.openspec.activeChanges).toBe("number");
    expect(typeof result.openspec.schemasCount).toBe("number");

    expect(typeof result.sync.lastRef).toBe("string");
    expect(typeof result.sync.lastAt).toBe("string");
    expect(typeof result.sync.trackedFiles).toBe("number");
  });
});
