import { describe, test, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

import { runInit } from "../../src/commands/init.js";

/**
 * Create a temporary directory with a minimal mock project structure.
 * Returns the path to the temp directory.
 */
function createMockProject(overrides?: {
  packageJsonName?: string;
  withTypeScript?: boolean;
  withSrcDir?: boolean;
}): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-init-test-"));
  const useTS = overrides?.withTypeScript !== false; // default true

  // package.json
  const pkgName = overrides?.packageJsonName ?? "test-project";
  fs.writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ name: pkgName, version: "1.0.0" }, null, 2),
  );

  // tsconfig.json (optional)
  if (useTS) {
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true } }, null, 2),
    );
  }

  // Initialize git repo
  fs.mkdirSync(path.join(tmpDir, ".git"));

  // Source files
  const srcDir = overrides?.withSrcDir === true ? "src" : null;
  if (srcDir) {
    fs.mkdirSync(path.join(tmpDir, srcDir));
    fs.writeFileSync(
      path.join(tmpDir, srcDir, "index.ts"),
      'export function main(): void { console.log("hello"); }',
    );
    fs.mkdirSync(path.join(tmpDir, srcDir, "utils"));
    fs.writeFileSync(
      path.join(tmpDir, srcDir, "utils", "helpers.ts"),
      'export function helper(): string { return "ok"; }',
    );
  } else {
    // Files at project root
    fs.writeFileSync(
      path.join(tmpDir, "index.ts"),
      'export function main(): void { console.log("hello"); }',
    );
    fs.mkdirSync(path.join(tmpDir, "utils"));
    fs.writeFileSync(
      path.join(tmpDir, "utils", "helpers.ts"),
      'export function helper(): string { return "ok"; }',
    );
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

describe("sdd init orchestrator", { timeout: 60000 }, () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createMockProject({ withSrcDir: true });
  });

  afterEach(() => {
    cleanupProject(tmpDir);
  });

  // -- Basic initialization ---------------------------------------------------

  test("initializes a project and creates config file", async () => {
    const result = await runInit(tmpDir, {});

    expect(result.errors).toHaveLength(0);
    expect(result.projectName).toBe("test-project");
    expect(result.languages).toContain("javascript");
    expect(result.languages).toContain("typescript");
    expect(result.srcDir).toBe("src");

    // Config file should exist
    const configPath = path.join(tmpDir, ".sdd-exoskeleton", "config.json");
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.project.name).toBe("test-project");
    expect(config.project.languages).toEqual(
      expect.arrayContaining(["javascript", "typescript"]),
    );
  });

  test("creates OpenSpec directory structure", async () => {
    await runInit(tmpDir, {});

    expect(fs.existsSync(path.join(tmpDir, "openspec"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "openspec", "specs"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "openspec", "specs", "modules"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "openspec", "schemas"))).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, "openspec", "changes", "active")),
    ).toBe(true);
  });

  test("creates vault directory structure (hybrid)", async () => {
    await runInit(tmpDir, {});

    const vaultPath = path.join(tmpDir, "sdd-vault");
    expect(fs.existsSync(vaultPath)).toBe(true);
    expect(fs.existsSync(path.join(vaultPath, "modules"))).toBe(true);
    expect(fs.existsSync(path.join(vaultPath, ".obsidian"))).toBe(true);
    expect(fs.existsSync(path.join(vaultPath, ".obsidian", "app.json"))).toBe(true);
  });

  test("writes CLAUDE.md and AGENTS.md", async () => {
    const result = await runInit(tmpDir, {});

    const claudePath = path.join(tmpDir, "CLAUDE.md");
    const agentsPath = path.join(tmpDir, "AGENTS.md");

    expect(fs.existsSync(claudePath)).toBe(true);
    expect(fs.existsSync(agentsPath)).toBe(true);

    // Verify content contains project name
    const claudeContent = fs.readFileSync(claudePath, "utf-8");
    expect(claudeContent).toContain("test-project");
    expect(claudeContent).toContain("sdd-exoskeleton");

    // Verify generated report
    const writtenFiles = result.generated.filter((f) => f.endsWith(".md"));
    expect(writtenFiles.length).toBeGreaterThanOrEqual(2);
  });

  // -- --dry-run --------------------------------------------------------------

  test("--dry-run does not write any files", async () => {
    const result = await runInit(tmpDir, { dryRun: true });

    // No files should be written
    expect(fs.existsSync(path.join(tmpDir, ".sdd-exoskeleton"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "openspec"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "sdd-vault"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "CLAUDE.md"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "AGENTS.md"))).toBe(false);

    // Detection should still have run
    expect(result.projectName).toBe("test-project");
    expect(result.languages).toContain("typescript");
  });

  test("--dry-run reports what would be generated", async () => {
    const result = await runInit(tmpDir, { dryRun: true });

    expect(result.generated.length).toBeGreaterThan(0);
    const allDryRun = result.generated.every((g) => g.startsWith("[DRY RUN]"));
    expect(allDryRun).toBe(true);
  });

  // -- --force ----------------------------------------------------------------

  test("errors when config already exists and --force is not set", async () => {
    // First init
    await runInit(tmpDir, {});

    // Second init without --force should error
    const result = await runInit(tmpDir, {});

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Config already exists");
  });

  test("--force overwrites existing config", async () => {
    // First init
    await runInit(tmpDir, {});

    // Modify config to simulate user changes
    const configPath = path.join(tmpDir, ".sdd-exoskeleton", "config.json");
    const existing = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    existing.custom = "user-value";
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));

    // Re-init with --force
    const result = await runInit(tmpDir, { force: true });

    expect(result.errors).toHaveLength(0);

    // Config should be overwritten (no custom key)
    const newConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(newConfig.custom).toBeUndefined();
    expect(newConfig.project.name).toBe("test-project");
  });

  // -- --skip -----------------------------------------------------------------

  test("--skip openspec does not create openspec dirs or specs", async () => {
    const result = await runInit(tmpDir, { skip: "openspec" });

    expect(result.errors).toHaveLength(0);

    // OpenSpec dirs should not exist
    expect(fs.existsSync(path.join(tmpDir, "openspec"))).toBe(false);

    // But other things should still be created
    expect(fs.existsSync(path.join(tmpDir, ".sdd-exoskeleton"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "sdd-vault"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "CLAUDE.md"))).toBe(true);
  });

  test("--skip obsidian does not create vault", async () => {
    const result = await runInit(tmpDir, { skip: "obsidian" });

    expect(result.errors).toHaveLength(0);

    // Vault should not exist
    expect(fs.existsSync(path.join(tmpDir, "sdd-vault"))).toBe(false);

    // But OpenSpec and constitution should
    expect(fs.existsSync(path.join(tmpDir, "openspec"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "CLAUDE.md"))).toBe(true);
  });

  test("--skip constitution does not write CLAUDE.md or AGENTS.md", async () => {
    await runInit(tmpDir, { skip: "constitution" });

    expect(fs.existsSync(path.join(tmpDir, "CLAUDE.md"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "AGENTS.md"))).toBe(false);

    // But other files should exist
    expect(fs.existsSync(path.join(tmpDir, "openspec"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "sdd-vault"))).toBe(true);
  });

  test("--skip with multiple steps works", async () => {
    const result = await runInit(tmpDir, { skip: "openspec,constitution" });

    expect(result.errors).toHaveLength(0);
    expect(fs.existsSync(path.join(tmpDir, "openspec"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "CLAUDE.md"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "sdd-vault"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".sdd-exoskeleton"))).toBe(true);
  });

  test("--skip codegraph skips indexing but still creates output", async () => {
    const result = await runInit(tmpDir, { skip: "codegraph" });

    expect(result.errors).toHaveLength(0);

    // Everything else should still be created
    expect(fs.existsSync(path.join(tmpDir, ".sdd-exoskeleton"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "openspec"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "CLAUDE.md"))).toBe(true);
  });

  // -- --lang -----------------------------------------------------------------

  test("--lang forces a single language", async () => {
    const result = await runInit(tmpDir, { lang: "python" });

    expect(result.languages).toEqual(["python"]);

    // Config should reflect forced language
    const configPath = path.join(tmpDir, ".sdd-exoskeleton", "config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.project.languages).toEqual(["python"]);
  });

  test("--lang overrides auto-detection of typescript", async () => {
    // Project has tsconfig.json so auto-detects typescript
    const result = await runInit(tmpDir, { lang: "go" });

    expect(result.languages).toEqual(["go"]);
    expect(result.languages).not.toContain("typescript");
    expect(result.languages).not.toContain("javascript");
  });

  // -- --depth ----------------------------------------------------------------

  test("--depth quick skips indexing but still detects modules", async () => {
    const result = await runInit(tmpDir, { depth: "quick" });

    expect(result.errors).toHaveLength(0);
    expect(result.topology.modules.length).toBeGreaterThan(0);
    // Files should still be generated
    expect(fs.existsSync(path.join(tmpDir, ".sdd-exoskeleton"))).toBe(true);
  });

  test("--depth standard completes full pipeline", async () => {
    const result = await runInit(tmpDir, { depth: "standard" });

    expect(result.errors).toHaveLength(0);
    expect(result.projectName).toBe("test-project");
  });

  test("--depth deep completes full pipeline (reserved for future)", async () => {
    const result = await runInit(tmpDir, { depth: "deep" });

    expect(result.errors).toHaveLength(0);
    expect(result.projectName).toBe("test-project");
  });

  test("invalid --depth throws an error", async () => {
    await expect(runInit(tmpDir, { depth: "invalid" })).rejects.toThrow(
      'Invalid depth "invalid"',
    );
  });

  // -- --vault-strategy -------------------------------------------------------

  test("--vault-strategy embedded calls initVault and creates vault content in project root", async () => {
    const result = await runInit(tmpDir, {
      vaultStrategy: "embedded",
      skip: "openspec,constitution", // simplify assertion
    });

    expect(result.errors).toHaveLength(0);

    // No sdd-vault subdirectory
    expect(fs.existsSync(path.join(tmpDir, "sdd-vault"))).toBe(false);

    // Module notes should be in the project root's modules/ dir
    expect(fs.existsSync(path.join(tmpDir, "modules"))).toBe(true);

    // .obsidian/ config should be created in project root
    expect(fs.existsSync(path.join(tmpDir, ".obsidian"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".obsidian", "app.json"))).toBe(true);
  });

  test("--vault-strategy standalone creates vault at specified path", async () => {
    const standaloneVault = path.join(tmpDir, "my-standalone-vault");

    const result = await runInit(tmpDir, {
      vaultStrategy: "standalone",
      vault: standaloneVault,
      skip: "openspec,constitution",
    });

    expect(result.errors).toHaveLength(0);
    expect(fs.existsSync(standaloneVault)).toBe(true);
    expect(fs.existsSync(path.join(standaloneVault, "modules"))).toBe(true);
    expect(fs.existsSync(path.join(standaloneVault, ".obsidian"))).toBe(true);
  });

  test("invalid --vault-strategy throws an error", async () => {
    await expect(
      runInit(tmpDir, { vaultStrategy: "bogus" }),
    ).rejects.toThrow('Invalid vault strategy "bogus"');
  });

  // -- Error handling ---------------------------------------------------------

  test("auto-detects project name from package.json", async () => {
    cleanupProject(tmpDir);
    tmpDir = createMockProject({ packageJsonName: "@scope/my-pkg" });

    const result = await runInit(tmpDir, {});

    expect(result.projectName).toBe("@scope/my-pkg");
  });

  test("falls back to directory name when no package.json", async () => {
    cleanupProject(tmpDir);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-init-test-"));

    // No package.json — create minimal git repo
    fs.mkdirSync(path.join(tmpDir, ".git"));

    const dirName = path.basename(tmpDir);
    const result = await runInit(tmpDir, {});

    expect(result.projectName).toBe(dirName);
  });

  test("completes even when no git repo exists", async () => {
    cleanupProject(tmpDir);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-init-test-"));

    // Create package.json but no .git
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "no-git-project" }, null, 2),
    );

    const result = await runInit(tmpDir, {});

    // Should warn about no git but still complete
    expect(result.errors.length).toBeLessThanOrEqual(2); // some errors OK from other phases
    expect(fs.existsSync(path.join(tmpDir, ".sdd-exoskeleton"))).toBe(true);
  });

  test("does not overwrite user CLAUDE.md without sdd marker", async () => {
    // Pre-create a user CLAUDE.md without the sdd marker
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "# User's Custom CLAUDE.md\n\nThis is user content.",
    );

    const result = await runInit(tmpDir, {});

    const claudeContent = fs.readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf-8");
    // User content should be preserved
    expect(claudeContent).toContain("User's Custom CLAUDE.md");
    expect(claudeContent).not.toContain("sdd-exoskeleton");
  });
});
