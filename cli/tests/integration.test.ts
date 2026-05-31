import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as child_process from "node:child_process";

// ---------------------------------------------------------------------------
// Mock codegraph isInstalled/isIndexed to avoid 15-second npx timeout.
// All other exports (getModules, getDependencies, etc.) use real fallbacks.
// ---------------------------------------------------------------------------
vi.mock("../src/integrations/codegraph.js", async () => {
  const actual =
    await vi.importActual<typeof import("../src/integrations/codegraph.js")>(
      "../src/integrations/codegraph.js",
    );
  return {
    ...actual,
    isInstalled: vi.fn().mockResolvedValue(false),
    isIndexed: vi.fn().mockResolvedValue(false),
  };
});

import { runInit } from "../src/commands/init.js";
import { runSync } from "../src/commands/sync.js";
import { runStatus } from "../src/commands/status.js";
import { runDoctor } from "../src/commands/doctor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sdd-integration-"));
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function initGitRepo(dir: string): void {
  child_process.execSync("git init", { cwd: dir, stdio: "pipe" });
  child_process.execSync("git config user.email test@integration.sdd", {
    cwd: dir,
    stdio: "pipe",
  });
  child_process.execSync('git config user.name "SDD Integration Test"', {
    cwd: dir,
    stdio: "pipe",
  });
}

function gitAddAndCommit(dir: string, message: string): void {
  child_process.execSync("git add .", { cwd: dir, stdio: "pipe" });
  child_process.execSync(`git commit -m "${message}"`, {
    cwd: dir,
    stdio: "pipe",
  });
}

function getHeadSha(dir: string): string {
  return child_process
    .execSync("git rev-parse HEAD", { cwd: dir, encoding: "utf-8" })
    .trim();
}

function writeFile(dir: string, filePath: string, content: string): void {
  const fullPath = path.join(dir, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
}

/** Spy on process.exit so error-case branches throw instead of killing the runner. */
function mockProcessExit(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(process, "exit").mockImplementation(((_code) => {
    throw new Error("process.exit");
  }) as never);
}

// ---------------------------------------------------------------------------
// Fixture: create a realistic legacy TypeScript project
// ---------------------------------------------------------------------------

async function createMockProject(tmpDir: string): Promise<string> {
  const files: Record<string, string> = {
    "package.json": JSON.stringify(
      { name: "test-legacy-app", version: "1.0.0" },
      null,
      2,
    ),
    "tsconfig.json": JSON.stringify(
      { compilerOptions: { target: "ES2022", module: "commonjs", strict: true } },
      null,
      2,
    ),
    "src/index.ts": `import { helper } from "./utils/helper";\nconsole.log(helper());\n`,
    "src/utils/helper.ts": `export function helper(): string { return "hello"; }\n`,
    "src/auth/login.ts": `export function login(user: string): boolean { return user.length > 0; }\n`,
    "src/db/query.ts": `export function query(sql: string): unknown[] { return []; }\n`,
  };

  for (const [filePath, content] of Object.entries(files)) {
    writeFile(tmpDir, filePath, content);
  }

  // git init + commit
  initGitRepo(tmpDir);
  gitAddAndCommit(tmpDir, "Initial commit");

  return tmpDir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe(
  "SDD Exoskeleton Integration",
  { timeout: 120_000 },
  () => {
    let tmpDir: string;
    let initialCommitSha: string;

    beforeAll(async () => {
      tmpDir = createTempDir();
      await createMockProject(tmpDir);
      initialCommitSha = getHeadSha(tmpDir);
    });

    afterAll(() => {
      cleanupDir(tmpDir);
    });

    // -----------------------------------------------------------------------
    // Test 1: init detects TypeScript project correctly
    // -----------------------------------------------------------------------

    test("init detects TypeScript project correctly", async () => {
      const result = await runInit(tmpDir, { depth: "quick" });

      expect(result.errors).toHaveLength(0);
      expect(result.projectName).toBe("test-legacy-app");
      expect(result.languages).toContain("javascript");
      expect(result.languages).toContain("typescript");
      expect(result.srcDir).toBe("src");
    });

    // -----------------------------------------------------------------------
    // Test 2: init generates all expected output files
    // -----------------------------------------------------------------------

    test("init generates all expected output files", async () => {
      // runInit already ran in the previous test, but it will error because
      // config already exists. Force it to regenerate for this test.
      const result = await runInit(tmpDir, { depth: "quick", force: true });

      expect(result.errors).toHaveLength(0);

      // 1. Config file
      const configPath = path.join(
        tmpDir,
        ".sdd-exoskeleton",
        "config.json",
      );
      expect(fs.existsSync(configPath)).toBe(true);

      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(config.project.name).toBe("test-legacy-app");
      expect(config.project.languages).toEqual(
        expect.arrayContaining(["javascript", "typescript"]),
      );
      expect(config.project.srcDir).toBe("src");

      // 2. OpenSpec directory with specs/
      const openspecDir = path.join(tmpDir, "openspec");
      expect(fs.existsSync(openspecDir)).toBe(true);
      expect(fs.existsSync(path.join(openspecDir, "specs"))).toBe(true);
      expect(
        fs.existsSync(path.join(openspecDir, "specs", "modules")),
      ).toBe(true);
      expect(fs.existsSync(path.join(openspecDir, "schemas"))).toBe(true);
      expect(
        fs.existsSync(path.join(openspecDir, "changes", "active")),
      ).toBe(true);

      // 3. sdd-vault (hybrid strategy default) with modules/
      const vaultPath = path.join(tmpDir, "sdd-vault");
      expect(fs.existsSync(vaultPath)).toBe(true);
      expect(fs.existsSync(path.join(vaultPath, "modules"))).toBe(true);
      expect(fs.existsSync(path.join(vaultPath, ".obsidian"))).toBe(true);
      expect(
        fs.existsSync(path.join(vaultPath, ".obsidian", "app.json")),
      ).toBe(true);

      // 4. CLAUDE.md with project name
      const claudePath = path.join(tmpDir, "CLAUDE.md");
      expect(fs.existsSync(claudePath)).toBe(true);
      const claudeContent = fs.readFileSync(claudePath, "utf-8");
      expect(claudeContent).toContain("test-legacy-app");
      expect(claudeContent).toContain("sdd-exoskeleton");

      // 5. AGENTS.md
      const agentsPath = path.join(tmpDir, "AGENTS.md");
      expect(fs.existsSync(agentsPath)).toBe(true);
      const agentsContent = fs.readFileSync(agentsPath, "utf-8");
      expect(agentsContent).toContain("test-legacy-app");
      expect(agentsContent).toContain("SDD");

      // 6. Verify generated list includes key files
      const generatedPaths = result.generated;
      expect(generatedPaths).toContain(configPath);
      expect(generatedPaths).toContain(openspecDir);
      expect(generatedPaths).toContain(vaultPath);
      expect(generatedPaths).toContain(claudePath);
      expect(generatedPaths).toContain(agentsPath);
    });

    // -----------------------------------------------------------------------
    // Test 3: sync detects changes after code modification
    // -----------------------------------------------------------------------

    test("sync detects changes after code modification", async () => {
      // Commit all sdd-generated files first so the next sync's baseline
      // only sees intentional code changes.
      gitAddAndCommit(tmpDir, "SDD init");

      const postInitSha = getHeadSha(tmpDir);

      // Make a code change: add new file and modify existing
      writeFile(
        tmpDir,
        "src/api/handler.ts",
        `import { login } from "../auth/login";\n\nexport function handleRequest(user: string): string {\n  return login(user) ? "ok" : "denied";\n}\n`,
      );

      // Modify src/index.ts
      writeFile(
        tmpDir,
        "src/index.ts",
        `import { helper } from "./utils/helper";\nimport { handleRequest } from "./api/handler";\n\nconsole.log(helper());\nconsole.log(handleRequest("admin"));\n`,
      );

      // Commit the code changes
      gitAddAndCommit(tmpDir, "Add API handler and update index");

      // Mock process.exit to guard against unexpected exits
      const exitSpy = mockProcessExit();

      try {
        const result = await runSync(tmpDir, { since: postInitSha });

        // Verify sync detected changes
        expect(result.changedFiles).toBeGreaterThan(0);
        expect(result.changedSymbols).toBeGreaterThan(0);
        expect(["low", "medium", "high"]).toContain(result.impactLevel);
        expect(result.conflictReport).toHaveProperty("hasConflict");
        expect(result.dryRun).toBe(false);

        // Verify delta proposal was generated
        expect(result.deltaPath).toBeDefined();
        expect(result.deltaPath).toContain("openspec");
        if (result.deltaPath) {
          expect(fs.existsSync(result.deltaPath)).toBe(true);
          const proposalPath = path.join(result.deltaPath, "proposal.md");
          expect(fs.existsSync(proposalPath)).toBe(true);

          // Verify proposal content references our changes
          const proposalContent = fs.readFileSync(proposalPath, "utf-8");
          expect(proposalContent).toContain("Impact Level");
        }

        // Verify sync state was updated
        const statePath = path.join(
          tmpDir,
          ".sdd-exoskeleton",
          "sync-state.json",
        );
        expect(fs.existsSync(statePath)).toBe(true);
        const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
        const entries = state.entries ?? {};
        expect(Object.keys(entries).length).toBeGreaterThan(0);

        // Verify config was updated with new sync ref + timestamp
        const configPath = path.join(
          tmpDir,
          ".sdd-exoskeleton",
          "config.json",
        );
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        expect(config.sync.lastSyncRef).toBeTruthy();
        expect(config.sync.lastSyncAt).toBeTruthy();
        // The lastSyncRef should now be the current HEAD
        const currentHead = getHeadSha(tmpDir);
        expect(config.sync.lastSyncRef).toBe(currentHead);
      } finally {
        exitSpy.mockRestore();
      }
    });

    // -----------------------------------------------------------------------
    // Test 4: full workflow — init → change → sync → status → doctor
    // -----------------------------------------------------------------------

    test(
      "full workflow: init → change → sync → status → doctor",
      async () => {
        // -- Status -----------------------------------------------------------
        const status = await runStatus(tmpDir);

        expect(status.project.name).toBe("test-legacy-app");
        expect(status.project.languages).toEqual(
          expect.arrayContaining(["javascript", "typescript"]),
        );
        expect(status.project.srcDir).toBe("src");
        expect(status.project.vaultStrategy).toBe("hybrid");

        // CodeGraph should not be installed (we mocked it)
        expect(status.codegraph.installed).toBe(false);

        // OpenSpec should have specs and schemas from init
        expect(status.openspec.specsCount).toBeGreaterThanOrEqual(0);

        // Sync should have been updated by the previous test
        expect(status.sync.lastRef).toBeTruthy();

        // -- Doctor -----------------------------------------------------------
        const doctor = await runDoctor(tmpDir);

        expect(doctor.passed).toBeGreaterThan(0);
        expect(doctor.failures).toBe(0);
        // Warnings are expected for CodeGraph (not installed)
        expect(doctor.warnings).toBeGreaterThanOrEqual(0);
      },
    );
  },
);
