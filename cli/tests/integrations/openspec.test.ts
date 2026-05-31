import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  initOpenSpec,
  writeSpec,
  writeSchema,
  createChangeFolder,
  archiveChange,
} from "../../src/integrations/openspec.js";
import type { SpecDoc, SchemaDoc } from "../../src/integrations/openspec.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sdd-openspec-test-"));
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf-8");
}

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

function dirExists(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeSampleSpecDoc(): SpecDoc {
  return {
    title: "Authentication Module",
    module: "auth",
    description: "Handles user authentication, session management, and OAuth flows.",
    classes: [
      { name: "AuthService", description: "Core authentication service" },
      { name: "TokenManager", description: "JWT token generation and validation" },
    ],
    apis: [
      {
        name: "login",
        signature: "login(email: string, password: string): Promise<AuthResult>",
        description: "Authenticate a user with email and password",
      },
      {
        name: "logout",
        signature: "logout(sessionId: string): Promise<void>",
        description: "Invalidate a user session",
      },
    ],
    dependencies: ["database", "cache"],
  };
}

function makeSampleSchemaDoc(): SchemaDoc {
  return {
    title: "Users Table",
    table: "users",
    columns: [
      { name: "id", type: "uuid", nullable: false, description: "Primary key" },
      { name: "email", type: "varchar(255)", nullable: false, description: "User email address" },
      { name: "name", type: "varchar(100)", nullable: false, description: "Display name" },
      { name: "avatar_url", type: "text", nullable: true, description: "Profile picture URL" },
      { name: "created_at", type: "timestamp", nullable: false, description: "Account creation time" },
    ],
    relations: [
      { target: "posts", type: "has_many", via: "user_id" },
    ],
  };
}

// ---------------------------------------------------------------------------
// initOpenSpec
// ---------------------------------------------------------------------------

describe("initOpenSpec", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the correct directory tree", () => {
    initOpenSpec(tmpDir);

    const openspecDir = path.join(tmpDir, "openspec");
    expect(dirExists(openspecDir)).toBe(true);
    expect(dirExists(path.join(openspecDir, "specs"))).toBe(true);
    expect(dirExists(path.join(openspecDir, "changes", "active"))).toBe(true);
    expect(dirExists(path.join(openspecDir, "changes", "archive"))).toBe(true);
    expect(dirExists(path.join(openspecDir, "schemas"))).toBe(true);
  });

  it("creates exactly the expected directories (no extra)", () => {
    initOpenSpec(tmpDir);

    const openspecDir = path.join(tmpDir, "openspec");
    function listDirsRecursive(dir: string, relative: string): string[] {
      const results: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const rel = relative ? `${relative}/${entry.name}` : entry.name;
          results.push(rel);
          results.push(...listDirsRecursive(path.join(dir, entry.name), rel));
        }
      }
      return results;
    }

    const dirs = listDirsRecursive(openspecDir, "").sort();
    expect(dirs).toEqual([
      "changes",
      "changes/active",
      "changes/archive",
      "schemas",
      "specs",
    ]);
  });

  it("is idempotent — running twice does not error", () => {
    initOpenSpec(tmpDir);
    // Second run should not throw
    expect(() => initOpenSpec(tmpDir)).not.toThrow();

    // Directories should still exist
    const openspecDir = path.join(tmpDir, "openspec");
    expect(dirExists(path.join(openspecDir, "specs"))).toBe(true);
  });

  it("does not overwrite existing files in the openspec tree", () => {
    initOpenSpec(tmpDir);

    // Create a file in specs/
    const existingFile = path.join(tmpDir, "openspec", "specs", "existing.md");
    writeFile(existingFile, "# Existing Spec");

    // Run init again
    initOpenSpec(tmpDir);

    // The existing file should still be there
    expect(readFile(existingFile)).toBe("# Existing Spec");
  });

  it("does not throw for a nested projectDir path", () => {
    const nestedDir = path.join(tmpDir, "deeply", "nested", "project");
    initOpenSpec(nestedDir);

    const openspecDir = path.join(nestedDir, "openspec");
    expect(dirExists(openspecDir)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// writeSpec
// ---------------------------------------------------------------------------

describe("writeSpec", () => {
  let tmpDir: string;
  let openspecPath: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    openspecPath = path.join(tmpDir, "openspec");
    initOpenSpec(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes a spec file to openspec/specs/<module>.md", () => {
    const spec = makeSampleSpecDoc();
    writeSpec(openspecPath, spec);

    const filePath = path.join(openspecPath, "specs", "auth.md");
    expect(fileExists(filePath)).toBe(true);
  });

  it("generates correct markdown with all sections", () => {
    const spec = makeSampleSpecDoc();
    writeSpec(openspecPath, spec);

    const content = readFile(path.join(openspecPath, "specs", "auth.md"));

    // Title
    expect(content).toContain("# Module: Authentication Module");

    // Overview
    expect(content).toContain("## Overview");
    expect(content).toContain("Handles user authentication");

    // Classes
    expect(content).toContain("## Classes");
    expect(content).toContain("### AuthService — Core authentication service");
    expect(content).toContain("### TokenManager — JWT token generation and validation");

    // API
    expect(content).toContain("## API");
    expect(content).toContain(
      "### login(email: string, password: string): Promise<AuthResult> — Authenticate a user with email and password",
    );

    // Dependencies
    expect(content).toContain("## Dependencies");
    expect(content).toContain("- database");
    expect(content).toContain("- cache");
  });

  it("writes a spec with no classes (omits Classes section)", () => {
    const spec: SpecDoc = {
      title: "Config Module",
      module: "config",
      description: "Application configuration.",
      classes: [],
      apis: [
        {
          name: "loadConfig",
          signature: "loadConfig(): Config",
          description: "Load configuration",
        },
      ],
      dependencies: [],
    };

    writeSpec(openspecPath, spec);

    const content = readFile(path.join(openspecPath, "specs", "config.md"));
    expect(content).toContain("# Module: Config Module");
    expect(content).toContain("## API");
    expect(content).not.toContain("## Classes");
  });

  it("writes a spec with no apis (omits API section)", () => {
    const spec: SpecDoc = {
      title: "Types Module",
      module: "types",
      description: "Shared type definitions.",
      classes: [],
      apis: [],
      dependencies: [],
    };

    writeSpec(openspecPath, spec);

    const content = readFile(path.join(openspecPath, "specs", "types.md"));
    expect(content).toContain("# Module: Types Module");
    expect(content).not.toContain("## Classes");
    expect(content).not.toContain("## API");
    expect(content).toContain("## Dependencies");
  });

  it("overwrites an existing spec file", () => {
    const spec = makeSampleSpecDoc();
    writeSpec(openspecPath, spec);

    const updatedSpec: SpecDoc = { ...spec, title: "Updated Auth Module" };
    writeSpec(openspecPath, updatedSpec);

    const content = readFile(path.join(openspecPath, "specs", "auth.md"));
    expect(content).toContain("# Module: Updated Auth Module");
    expect(content).not.toContain("# Module: Authentication Module");
  });

  it("does not throw when specs directory does not exist yet", () => {
    const emptyOpenspec = path.join(createTmpDir(), "openspec");
    // Don't call initOpenSpec — just ensure openspec dir exists but specs/ may not
    ensureDir(emptyOpenspec);

    const spec = makeSampleSpecDoc();
    expect(() => writeSpec(emptyOpenspec, spec)).not.toThrow();

    const content = readFile(path.join(emptyOpenspec, "specs", "auth.md"));
    expect(content).toContain("# Module: Authentication Module");

    // Cleanup the extra temp dir
    fs.rmSync(path.dirname(emptyOpenspec), { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// writeSchema
// ---------------------------------------------------------------------------

describe("writeSchema", () => {
  let tmpDir: string;
  let openspecPath: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    openspecPath = path.join(tmpDir, "openspec");
    initOpenSpec(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes a schema file to openspec/schemas/<table>.md", () => {
    const schema = makeSampleSchemaDoc();
    writeSchema(openspecPath, schema);

    const filePath = path.join(openspecPath, "schemas", "users.md");
    expect(fileExists(filePath)).toBe(true);
  });

  it("generates correct markdown with columns table", () => {
    const schema = makeSampleSchemaDoc();
    writeSchema(openspecPath, schema);

    const content = readFile(path.join(openspecPath, "schemas", "users.md"));

    // Title
    expect(content).toContain("# Schema: Users Table");

    // Columns header
    expect(content).toContain("## Columns");
    expect(content).toContain("| Name | Type | Nullable | Description |");

    // Column rows
    expect(content).toContain("| id | uuid | NO | Primary key |");
    expect(content).toContain("| email | varchar(255) | NO | User email address |");
    expect(content).toContain(
      "| avatar_url | text | YES | Profile picture URL |",
    );
  });

  it("generates relations section", () => {
    const schema = makeSampleSchemaDoc();
    writeSchema(openspecPath, schema);

    const content = readFile(path.join(openspecPath, "schemas", "users.md"));
    expect(content).toContain("## Relations");
    expect(content).toContain("- **posts** — has_many via `user_id`");
  });

  it("omits relations section when there are no relations", () => {
    const schema: SchemaDoc = {
      title: "Logs Table",
      table: "logs",
      columns: [
        { name: "id", type: "uuid", nullable: false, description: "Primary key" },
      ],
      relations: [],
    };

    writeSchema(openspecPath, schema);

    const content = readFile(path.join(openspecPath, "schemas", "logs.md"));
    expect(content).not.toContain("## Relations");
  });

  it("handles columns with no description", () => {
    const schema: SchemaDoc = {
      title: "Minimal Table",
      table: "minimal",
      columns: [
        { name: "id", type: "int", nullable: false },
        { name: "value", type: "text", nullable: true },
      ],
      relations: [],
    };

    writeSchema(openspecPath, schema);

    const content = readFile(path.join(openspecPath, "schemas", "minimal.md"));
    expect(content).toContain("| id | int | NO |  |");
    expect(content).toContain("| value | text | YES |  |");
  });

  it("overwrites an existing schema file", () => {
    const schema = makeSampleSchemaDoc();
    writeSchema(openspecPath, schema);

    const updatedSchema: SchemaDoc = { ...schema, title: "Users Table v2" };
    writeSchema(openspecPath, updatedSchema);

    const content = readFile(path.join(openspecPath, "schemas", "users.md"));
    expect(content).toContain("# Schema: Users Table v2");
  });
});

// ---------------------------------------------------------------------------
// createChangeFolder
// ---------------------------------------------------------------------------

describe("createChangeFolder", () => {
  let tmpDir: string;
  let openspecPath: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    openspecPath = path.join(tmpDir, "openspec");
    initOpenSpec(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a folder under openspec/changes/active/<name>/", () => {
    const changeDir = createChangeFolder(openspecPath, "add-oauth");

    const expectedDir = path.join(openspecPath, "changes", "active", "add-oauth");
    expect(changeDir).toBe(expectedDir);
    expect(dirExists(expectedDir)).toBe(true);
  });

  it("creates proposal.md skeleton inside the change folder", () => {
    createChangeFolder(openspecPath, "add-oauth");

    const proposalPath = path.join(
      openspecPath,
      "changes",
      "active",
      "add-oauth",
      "proposal.md",
    );
    expect(fileExists(proposalPath)).toBe(true);

    const content = readFile(proposalPath);
    expect(content).toContain("# Change: add-oauth");
    expect(content).toContain("## Motivation");
    expect(content).toContain("## Approach");
    expect(content).toContain("## Tasks");
  });

  it("returns the full path to the created folder", () => {
    const result = createChangeFolder(openspecPath, "fix-login");

    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toContain("changes/active/fix-login");
  });

  it("creates a change folder with a nested name", () => {
    const result = createChangeFolder(openspecPath, "feature/user-profiles");

    const expectedDir = path.join(
      openspecPath,
      "changes",
      "active",
      "feature/user-profiles",
    );
    expect(result).toBe(expectedDir);
    expect(dirExists(expectedDir)).toBe(true);
    expect(fileExists(path.join(expectedDir, "proposal.md"))).toBe(true);
  });

  it("creates parent directories when active/ does not exist", () => {
    // Remove the active dir to test auto-creation
    fs.rmSync(path.join(openspecPath, "changes"), { recursive: true, force: true });

    const changeDir = createChangeFolder(openspecPath, "add-oauth");

    expect(dirExists(changeDir)).toBe(true);
    expect(fileExists(path.join(changeDir, "proposal.md"))).toBe(true);
  });

  it("does not throw when the change folder already exists", () => {
    createChangeFolder(openspecPath, "add-oauth");

    // Create a file inside the existing folder
    writeFile(
      path.join(openspecPath, "changes", "active", "add-oauth", "notes.txt"),
      "extra notes",
    );

    // Re-creating should not throw or overwrite existing content
    expect(() => createChangeFolder(openspecPath, "add-oauth")).not.toThrow();

    const notesPath = path.join(
      openspecPath,
      "changes",
      "active",
      "add-oauth",
      "notes.txt",
    );
    expect(readFile(notesPath)).toBe("extra notes");
  });
});

// ---------------------------------------------------------------------------
// archiveChange
// ---------------------------------------------------------------------------

describe("archiveChange", () => {
  let tmpDir: string;
  let openspecPath: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    openspecPath = path.join(tmpDir, "openspec");
    initOpenSpec(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("moves a change folder from active to archive", () => {
    const changeDir = createChangeFolder(openspecPath, "add-oauth");

    // Add some content to verify it moves
    writeFile(path.join(changeDir, "implementation.md"), "# Implementation notes");

    archiveChange(openspecPath, "add-oauth");

    // Should no longer be in active
    const activeDir = path.join(openspecPath, "changes", "active", "add-oauth");
    expect(dirExists(activeDir)).toBe(false);

    // Should now be in archive
    const archiveDir = path.join(openspecPath, "changes", "archive", "add-oauth");
    expect(dirExists(archiveDir)).toBe(true);

    // Content should be preserved
    expect(fileExists(path.join(archiveDir, "proposal.md"))).toBe(true);
    expect(readFile(path.join(archiveDir, "implementation.md"))).toBe(
      "# Implementation notes",
    );
  });

  it("throws when the change folder does not exist", () => {
    expect(() => archiveChange(openspecPath, "nonexistent-change")).toThrow(
      'Cannot archive "nonexistent-change"',
    );
  });

  it("creates the archive directory if it does not exist", () => {
    // Remove the archive dir
    fs.rmSync(path.join(openspecPath, "changes", "archive"), {
      recursive: true,
      force: true,
    });

    createChangeFolder(openspecPath, "add-oauth");
    archiveChange(openspecPath, "add-oauth");

    const archiveDir = path.join(openspecPath, "changes", "archive", "add-oauth");
    expect(dirExists(archiveDir)).toBe(true);
  });

  it("can archive to an archive directory that already has entries", () => {
    createChangeFolder(openspecPath, "first");
    createChangeFolder(openspecPath, "second");

    archiveChange(openspecPath, "first");

    // first is in archive
    expect(dirExists(path.join(openspecPath, "changes", "archive", "first"))).toBe(true);
    // second is still in active
    expect(dirExists(path.join(openspecPath, "changes", "active", "second"))).toBe(true);
  });

  it("preserves all files within the change folder during archive", () => {
    const changeDir = createChangeFolder(openspecPath, "complex-change");

    writeFile(path.join(changeDir, "spec.md"), "# Spec");
    writeFile(path.join(changeDir, "tasks.md"), "- [ ] Task 1");
    ensureDir(path.join(changeDir, "notes"));
    writeFile(path.join(changeDir, "notes", "meeting.md"), "# Meeting notes");

    archiveChange(openspecPath, "complex-change");

    const archiveDir = path.join(
      openspecPath,
      "changes",
      "archive",
      "complex-change",
    );
    expect(fileExists(path.join(archiveDir, "proposal.md"))).toBe(true);
    expect(fileExists(path.join(archiveDir, "spec.md"))).toBe(true);
    expect(fileExists(path.join(archiveDir, "tasks.md"))).toBe(true);
    expect(fileExists(path.join(archiveDir, "notes", "meeting.md"))).toBe(true);
  });
});
