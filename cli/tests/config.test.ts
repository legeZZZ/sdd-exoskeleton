import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig, saveConfig, validateConfig, DEFAULT_CONFIG, SddConfig } from "../src/config.js";

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sdd-config-test-"));
}

function writeConfigFile(rootDir: string, config: unknown): void {
  const dir = path.join(rootDir, ".sdd-exoskeleton");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config, null, 2), "utf-8");
}

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns DEFAULT_CONFIG when no config file exists", () => {
    const config = loadConfig(tmpDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("loads a complete config file correctly", () => {
    const fullConfig: SddConfig = {
      version: "1.0.0",
      project: {
        name: "test-project",
        languages: ["typescript", "python"],
        rootDir: "/tmp/test",
        srcDir: "src",
      },
      codegraph: {
        indexPath: ".cg",
        mcpPort: 9999,
      },
      openspec: {
        path: "specs",
        changeDir: "specs/changes",
      },
      obsidian: {
        vaultPath: "vault",
        strategy: "standalone",
      },
      sync: {
        mode: "watch",
        lastSyncRef: "abc123",
        lastSyncAt: "2024-01-01T00:00:00Z",
      },
    };

    writeConfigFile(tmpDir, fullConfig);
    const loaded = loadConfig(tmpDir);
    expect(loaded).toEqual(fullConfig);
  });

  it("deep-merges partial config with DEFAULT_CONFIG", () => {
    const partialConfig = {
      project: {
        name: "my-project",
        languages: ["rust"],
      },
    };

    writeConfigFile(tmpDir, partialConfig);
    const loaded = loadConfig(tmpDir);

    expect(loaded.project.name).toBe("my-project");
    expect(loaded.project.languages).toEqual(["rust"]);
    // Fields not in config file should come from DEFAULT_CONFIG
    expect(loaded.version).toBe(DEFAULT_CONFIG.version);
    expect(loaded.codegraph).toEqual(DEFAULT_CONFIG.codegraph);
    expect(loaded.obsidian).toEqual(DEFAULT_CONFIG.obsidian);
    expect(loaded.sync).toEqual(DEFAULT_CONFIG.sync);
    expect(loaded.openspec).toEqual(DEFAULT_CONFIG.openspec);
  });

  it("throws on invalid JSON", () => {
    const dir = path.join(tmpDir, ".sdd-exoskeleton");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "config.json"), "not valid json {{", "utf-8");

    expect(() => loadConfig(tmpDir)).toThrow(/Invalid JSON/);
  });

  it("overwrites DEFAULT_CONFIG scalar values with provided values", () => {
    writeConfigFile(tmpDir, {
      version: "2.0.0",
      codegraph: { mcpPort: 5000 },
    });

    const loaded = loadConfig(tmpDir);
    expect(loaded.version).toBe("2.0.0");
    expect(loaded.codegraph.mcpPort).toBe(5000);
    expect(loaded.codegraph.indexPath).toBe(".codegraph"); // from default
  });
});

describe("saveConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("saves config and round-trips correctly", () => {
    const config: SddConfig = {
      version: "0.2.0",
      project: {
        name: "round-trip",
        languages: ["go"],
        rootDir: tmpDir,
        srcDir: "lib",
      },
      codegraph: {
        indexPath: ".graph",
        mcpPort: 3000,
      },
      openspec: {
        path: "open",
        changeDir: "open/changes",
      },
      obsidian: {
        vaultPath: "notes",
        strategy: "embedded",
      },
      sync: {
        mode: "git-hook",
        lastSyncRef: "def456",
        lastSyncAt: "2023-06-15T12:00:00Z",
      },
    };

    saveConfig(tmpDir, config);
    const loaded = loadConfig(tmpDir);
    expect(loaded).toEqual(config);
  });

  it("creates .sdd-exoskeleton directory if it does not exist", () => {
    const dir = path.join(tmpDir, ".sdd-exoskeleton");
    expect(fs.existsSync(dir)).toBe(false);

    saveConfig(tmpDir, DEFAULT_CONFIG as SddConfig);

    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(path.join(dir, "config.json"))).toBe(true);
  });

  it("writes formatted JSON", () => {
    saveConfig(tmpDir, DEFAULT_CONFIG as SddConfig);
    const raw = fs.readFileSync(
      path.join(tmpDir, ".sdd-exoskeleton", "config.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual(DEFAULT_CONFIG);
    // Should contain newlines (formatted)
    expect(raw).toContain("\n");
  });
});

describe("validateConfig", () => {
  function makeValidConfig(): SddConfig {
    return {
      version: "0.1.0",
      project: {
        name: "my-project",
        languages: ["typescript"],
        rootDir: "/app",
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
        vaultPath: "vault",
        strategy: "hybrid",
      },
      sync: {
        mode: "manual",
        lastSyncRef: "",
        lastSyncAt: "",
      },
    };
  }

  it("returns empty array for valid config", () => {
    const config = makeValidConfig();
    expect(validateConfig(config)).toEqual([]);
  });

  it("detects missing project", () => {
    const config = { ...makeValidConfig(), project: undefined as unknown as SddConfig["project"] };
    const issues = validateConfig(config);
    expect(issues).toContain("project is required");
  });

  it("detects empty project.name", () => {
    const config = makeValidConfig();
    config.project.name = "";
    const issues = validateConfig(config);
    expect(issues).toContain(
      "project.name is required and must be a non-empty string",
    );
  });

  it("detects empty project.languages", () => {
    const config = makeValidConfig();
    config.project.languages = [];
    const issues = validateConfig(config);
    expect(issues).toContain("project.languages must be a non-empty array");
  });

  it("detects missing project.rootDir", () => {
    const config = makeValidConfig();
    config.project.rootDir = "";
    const issues = validateConfig(config);
    expect(issues).toContain("project.rootDir is required and must be a non-empty string");
  });

  it("detects missing project.srcDir", () => {
    const config = makeValidConfig();
    config.project.srcDir = "";
    const issues = validateConfig(config);
    expect(issues).toContain("project.srcDir is required and must be a non-empty string");
  });

  it("detects invalid obsidian.strategy", () => {
    const config = makeValidConfig();
    (config.obsidian.strategy as string) = "invalid-strategy";
    const issues = validateConfig(config);
    expect(issues.some((i) => i.includes("obsidian.strategy"))).toBe(true);
  });

  it("detects invalid sync.mode", () => {
    const config = makeValidConfig();
    (config.sync.mode as string) = "cron";
    const issues = validateConfig(config);
    expect(issues.some((i) => i.includes("sync.mode"))).toBe(true);
  });

  it("detects missing obsidian section", () => {
    const config = { ...makeValidConfig(), obsidian: undefined as unknown as SddConfig["obsidian"] };
    const issues = validateConfig(config);
    expect(issues).toContain("obsidian is required");
  });

  it("detects missing sync section", () => {
    const config = { ...makeValidConfig(), sync: undefined as unknown as SddConfig["sync"] };
    const issues = validateConfig(config);
    expect(issues).toContain("sync is required");
  });

  it("validates all strategies are accepted", () => {
    for (const strategy of ["embedded", "standalone", "hybrid"] as const) {
      const config = makeValidConfig();
      config.obsidian.strategy = strategy;
      const issues = validateConfig(config);
      expect(issues).toEqual([]);
    }
  });

  it("validates all sync modes are accepted", () => {
    for (const mode of ["manual", "git-hook", "watch"] as const) {
      const config = makeValidConfig();
      config.sync.mode = mode;
      const issues = validateConfig(config);
      expect(issues).toEqual([]);
    }
  });
});
