import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  initVault,
  writeModuleNote,
  writeApiNote,
  writeDataModelNote,
  writeIndexNote,
  copyTemplates,
} from "../../src/integrations/obsidian.js";
import type {
  ApiInfo,
  DataModelInfo,
  VaultStrategy,
} from "../../src/integrations/obsidian.js";
import type { ModuleInfo } from "../../src/integrations/codegraph.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sdd-obsidian-test-"));
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

function listDirEntries(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeSampleModule(): ModuleInfo {
  return {
    name: "auth",
    path: "src/auth",
    files: ["src/auth/login.ts", "src/auth/logout.ts", "src/auth/session.ts"],
    exports: ["login", "logout", "validateSession"],
  };
}

function makeSampleApi(): ApiInfo {
  return {
    name: "login",
    route: "/api/auth/login",
    method: "POST",
    module: "auth",
  };
}

function makeSampleDataModel(): DataModelInfo {
  return {
    name: "User",
    table: "users",
    columns: ["id", "email", "name", "password_hash", "created_at"],
  };
}

function makeMultipleModules(): ModuleInfo[] {
  return [
    {
      name: "auth",
      path: "src/auth",
      files: ["src/auth/login.ts"],
      exports: ["login"],
    },
    {
      name: "database",
      path: "src/database",
      files: ["src/database/connection.ts"],
      exports: ["connect", "disconnect"],
    },
  ];
}

function makeMultipleApis(): ApiInfo[] {
  return [
    { name: "login", route: "/api/auth/login", method: "POST", module: "auth" },
    { name: "logout", route: "/api/auth/logout", method: "POST", module: "auth" },
  ];
}

function makeMultipleModels(): DataModelInfo[] {
  return [
    { name: "User", table: "users", columns: ["id", "email"] },
    { name: "Post", table: "posts", columns: ["id", "title", "body"] },
  ];
}

// ---------------------------------------------------------------------------
// initVault
// ---------------------------------------------------------------------------

describe("initVault", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("embedded strategy", () => {
    it("creates subdirectories directly under projectDir", () => {
      const vaultPath = initVault(tmpDir, "embedded");

      // Vault IS the projectDir
      expect(vaultPath).toBe(tmpDir);

      // All subdirectories should exist at project root
      expect(dirExists(path.join(tmpDir, "modules"))).toBe(true);
      expect(dirExists(path.join(tmpDir, "apis"))).toBe(true);
      expect(dirExists(path.join(tmpDir, "data"))).toBe(true);
      expect(dirExists(path.join(tmpDir, "journal"))).toBe(true);
      expect(dirExists(path.join(tmpDir, "decisions"))).toBe(true);
      expect(dirExists(path.join(tmpDir, "templates"))).toBe(true);
    });

    it("creates .obsidian/app.json with correct vaultName", () => {
      initVault(tmpDir, "embedded");

      const appJsonPath = path.join(tmpDir, ".obsidian", "app.json");
      expect(fileExists(appJsonPath)).toBe(true);

      const appConfig = JSON.parse(readFile(appJsonPath));
      expect(appConfig).toHaveProperty("vaultName");
      expect(appConfig.vaultName).toBe(path.basename(tmpDir));
    });

    it("is idempotent", () => {
      initVault(tmpDir, "embedded");

      // Second run should not throw
      expect(() => initVault(tmpDir, "embedded")).not.toThrow();

      // Directories should still exist
      expect(dirExists(path.join(tmpDir, "modules"))).toBe(true);
    });

    it("does not overwrite existing .obsidian/app.json", () => {
      // Create a custom app.json first
      const obsidianDir = path.join(tmpDir, ".obsidian");
      ensureDir(obsidianDir);
      const customConfig = { vaultName: "custom-name", theme: "dark" };
      writeFile(
        path.join(obsidianDir, "app.json"),
        JSON.stringify(customConfig),
      );

      initVault(tmpDir, "embedded");

      // The existing config should be preserved
      const appConfig = JSON.parse(
        readFile(path.join(tmpDir, ".obsidian", "app.json")),
      );
      expect(appConfig.vaultName).toBe("custom-name");
      expect(appConfig).toHaveProperty("theme", "dark");
    });

    it("does not clash with existing project files", () => {
      // Pre-create a source file that happens to share a name with a vault dir.
      // "modules" won't exist, but the project has src/ already.
      ensureDir(path.join(tmpDir, "src"));
      writeFile(path.join(tmpDir, "src", "index.ts"), "export const x = 1;");

      expect(() => initVault(tmpDir, "embedded")).not.toThrow();

      // The src/ should still be there
      expect(fileExists(path.join(tmpDir, "src", "index.ts"))).toBe(true);
    });
  });

  describe("standalone strategy", () => {
    it("creates subdirectories under projectDir (as vault root)", () => {
      const vaultPath = initVault(tmpDir, "standalone");

      expect(vaultPath).toBe(tmpDir);
      expect(dirExists(path.join(tmpDir, "modules"))).toBe(true);
      expect(dirExists(path.join(tmpDir, "apis"))).toBe(true);
      expect(dirExists(path.join(tmpDir, "data"))).toBe(true);
      expect(dirExists(path.join(tmpDir, "journal"))).toBe(true);
      expect(dirExists(path.join(tmpDir, "decisions"))).toBe(true);
      expect(dirExists(path.join(tmpDir, "templates"))).toBe(true);
    });

    it("creates .obsidian/ config", () => {
      initVault(tmpDir, "standalone");

      const appJsonPath = path.join(tmpDir, ".obsidian", "app.json");
      expect(fileExists(appJsonPath)).toBe(true);
    });
  });

  describe("hybrid strategy", () => {
    it("creates sdd-vault/ subdirectory inside projectDir", () => {
      const vaultPath = initVault(tmpDir, "hybrid");

      // Vault should be tmpDir/sdd-vault
      expect(vaultPath).toBe(path.join(tmpDir, "sdd-vault"));
      expect(dirExists(vaultPath)).toBe(true);
    });

    it("creates all subdirectories inside sdd-vault/", () => {
      const vaultPath = initVault(tmpDir, "hybrid");

      expect(dirExists(path.join(vaultPath, "modules"))).toBe(true);
      expect(dirExists(path.join(vaultPath, "apis"))).toBe(true);
      expect(dirExists(path.join(vaultPath, "data"))).toBe(true);
      expect(dirExists(path.join(vaultPath, "journal"))).toBe(true);
      expect(dirExists(path.join(vaultPath, "decisions"))).toBe(true);
      expect(dirExists(path.join(vaultPath, "templates"))).toBe(true);
    });

    it("creates .obsidian/ inside sdd-vault/ not project root", () => {
      const vaultPath = initVault(tmpDir, "hybrid");

      // .obsidian should be in the vault, not the project root
      expect(dirExists(path.join(vaultPath, ".obsidian"))).toBe(true);
      expect(dirExists(path.join(tmpDir, ".obsidian"))).toBe(false);
    });

    it("sets vaultName based on sdd-vault (or parent)", () => {
      const vaultPath = initVault(tmpDir, "hybrid");

      const appJsonPath = path.join(vaultPath, ".obsidian", "app.json");
      const appConfig = JSON.parse(readFile(appJsonPath));
      // With hybrid, the vault dir is "sdd-vault"
      expect(appConfig.vaultName).toBe("sdd-vault");
    });

    it("is idempotent", () => {
      const first = initVault(tmpDir, "hybrid");
      const second = initVault(tmpDir, "hybrid");

      expect(second).toBe(first);
      expect(dirExists(path.join(first, "modules"))).toBe(true);
    });

    it("creates nested directories when projectDir does not exist yet", () => {
      const nestedDir = path.join(tmpDir, "deeply", "nested", "project");
      const vaultPath = initVault(nestedDir, "hybrid");

      expect(dirExists(vaultPath)).toBe(true);
      expect(dirExists(path.join(vaultPath, "modules"))).toBe(true);
    });

    it("does not pollute project root with vault subdirectories", () => {
      initVault(tmpDir, "hybrid");

      // Project root should only contain sdd-vault/
      const rootEntries = listDirEntries(tmpDir);
      expect(rootEntries).toEqual(["sdd-vault"]);
    });
  });

  describe("strategy comparison", () => {
    it("embedded and standalone write subdirs at the same location", () => {
      const embeddedTmp = createTmpDir();
      const standaloneTmp = createTmpDir();

      const embeddedPath = initVault(embeddedTmp, "embedded");
      const standalonePath = initVault(standaloneTmp, "standalone");

      // Both return the given projectDir as vault path
      expect(embeddedPath).toBe(embeddedTmp);
      expect(standalonePath).toBe(standaloneTmp);

      // Both create the same subdirectories
      const embeddedDirs = listDirEntries(embeddedTmp).sort();
      const standaloneDirs = listDirEntries(standaloneTmp).sort();
      expect(embeddedDirs).toEqual(standaloneDirs);

      fs.rmSync(embeddedTmp, { recursive: true, force: true });
      fs.rmSync(standaloneTmp, { recursive: true, force: true });
    });

    it("hybrid isolates vault content inside sdd-vault/", () => {
      initVault(tmpDir, "hybrid");

      // The sdd-vault dir should contain all the vault subdirectories + .obsidian
      const vaultDir = path.join(tmpDir, "sdd-vault");
      const vaultEntries = listDirEntries(vaultDir).sort();
      expect(vaultEntries).toContain("modules");
      expect(vaultEntries).toContain("apis");
      expect(vaultEntries).toContain("data");
      expect(vaultEntries).toContain("journal");
      expect(vaultEntries).toContain("decisions");
      expect(vaultEntries).toContain("templates");
      expect(vaultEntries).toContain(".obsidian");
    });
  });
});

// ---------------------------------------------------------------------------
// writeModuleNote
// ---------------------------------------------------------------------------

describe("writeModuleNote", () => {
  let tmpDir: string;
  let vaultPath: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    vaultPath = initVault(tmpDir, "hybrid");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates modules/<name>.md", () => {
    const mod = makeSampleModule();
    writeModuleNote(vaultPath, mod);

    expect(fileExists(path.join(vaultPath, "modules", "auth.md"))).toBe(true);
  });

  it("generates correct frontmatter", () => {
    const mod = makeSampleModule();
    writeModuleNote(vaultPath, mod);

    const content = readFile(path.join(vaultPath, "modules", "auth.md"));

    expect(content).toContain("---");
    expect(content).toContain("module: auth");
    expect(content).toContain("type: module");
    expect(content).toContain("tags: [sdd, auto-generated, module]");
    expect(content).toContain("created: ");
  });

  it("generates correct headings", () => {
    const mod = makeSampleModule();
    writeModuleNote(vaultPath, mod);

    const content = readFile(path.join(vaultPath, "modules", "auth.md"));

    expect(content).toContain("# Module: auth");
    expect(content).toContain("## Files");
    expect(content).toContain("## Exports");
  });

  it("lists all files in the Files section", () => {
    const mod = makeSampleModule();
    writeModuleNote(vaultPath, mod);

    const content = readFile(path.join(vaultPath, "modules", "auth.md"));

    for (const file of mod.files) {
      expect(content).toContain(`- ${file}`);
    }
  });

  it("lists all exports in the Exports section", () => {
    const mod = makeSampleModule();
    writeModuleNote(vaultPath, mod);

    const content = readFile(path.join(vaultPath, "modules", "auth.md"));

    for (const exp of mod.exports) {
      expect(content).toContain(`- ${exp}`);
    }
  });

  it("handles modules with empty exports", () => {
    const mod: ModuleInfo = {
      name: "empty-module",
      path: "src/empty",
      files: ["src/empty/index.ts"],
      exports: [],
    };
    writeModuleNote(vaultPath, mod);

    const content = readFile(
      path.join(vaultPath, "modules", "empty-module.md"),
    );
    expect(content).toContain("_No exports detected._");
  });

  it("handles modules with empty files array", () => {
    const mod: ModuleInfo = {
      name: "no-files",
      path: "src/no-files",
      files: [],
      exports: ["placeholder"],
    };
    writeModuleNote(vaultPath, mod);

    const content = readFile(
      path.join(vaultPath, "modules", "no-files.md"),
    );
    expect(content).toContain("## Files");
    expect(content).toContain("## Exports");
    expect(content).toContain("- placeholder");
  });

  it("creates the modules directory if it does not exist", () => {
    // Remove modules/ dir
    fs.rmSync(path.join(vaultPath, "modules"), { recursive: true, force: true });

    const mod = makeSampleModule();
    expect(() => writeModuleNote(vaultPath, mod)).not.toThrow();
    expect(fileExists(path.join(vaultPath, "modules", "auth.md"))).toBe(true);
  });

  it("overwrites an existing module note", () => {
    const mod = makeSampleModule();
    writeModuleNote(vaultPath, mod);

    // Verify initial write
    const initialContent = readFile(
      path.join(vaultPath, "modules", "auth.md"),
    );
    expect(initialContent).toContain("- login");

    // Write again with different data
    const updatedMod: ModuleInfo = {
      ...mod,
      exports: ["login", "logout", "validateSession", "refreshToken"],
    };
    writeModuleNote(vaultPath, updatedMod);

    const content = readFile(path.join(vaultPath, "modules", "auth.md"));
    // Should contain the new export
    expect(content).toContain("- refreshToken");
    // Should still contain the original exports (since we replaced the whole file)
    expect(content).toContain("- login");
    // Files section should still be present
    for (const file of mod.files) {
      expect(content).toContain(`- ${file}`);
    }
  });

  it("writes a module with special characters in name", () => {
    const mod: ModuleInfo = {
      name: "my-utils_lib",
      path: "src/my-utils_lib",
      files: ["src/my-utils_lib/helpers.ts"],
      exports: ["helperFn"],
    };
    writeModuleNote(vaultPath, mod);

    const content = readFile(
      path.join(vaultPath, "modules", "my-utils_lib.md"),
    );
    expect(content).toContain("# Module: my-utils_lib");
    expect(content).toContain("module: my-utils_lib");
  });
});

// ---------------------------------------------------------------------------
// writeApiNote
// ---------------------------------------------------------------------------

describe("writeApiNote", () => {
  let tmpDir: string;
  let vaultPath: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    vaultPath = initVault(tmpDir, "hybrid");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates apis/<name>.md", () => {
    const api = makeSampleApi();
    writeApiNote(vaultPath, api);

    expect(fileExists(path.join(vaultPath, "apis", "login.md"))).toBe(true);
  });

  it("generates correct frontmatter", () => {
    const api = makeSampleApi();
    writeApiNote(vaultPath, api);

    const content = readFile(path.join(vaultPath, "apis", "login.md"));

    expect(content).toContain("---");
    expect(content).toContain("name: login");
    expect(content).toContain("type: api");
    expect(content).toContain("route: /api/auth/login");
    expect(content).toContain("method: POST");
    expect(content).toContain("module: auth");
    expect(content).toContain("tags: [sdd, auto-generated, api]");
    expect(content).toContain("created: ");
  });

  it("generates correct headings and details", () => {
    const api = makeSampleApi();
    writeApiNote(vaultPath, api);

    const content = readFile(path.join(vaultPath, "apis", "login.md"));

    expect(content).toContain("# API: login");
    expect(content).toContain("## Details");
    expect(content).toContain("**Route:** `");
    expect(content).toContain("**Method:** POST");
  });

  it("includes a wikilink to the parent module", () => {
    const api = makeSampleApi();
    writeApiNote(vaultPath, api);

    const content = readFile(path.join(vaultPath, "apis", "login.md"));

    // Wikilink format: [[modules/auth|auth]]
    expect(content).toContain("[[modules/auth|auth]]");
  });

  it("creates the apis directory if it does not exist", () => {
    fs.rmSync(path.join(vaultPath, "apis"), { recursive: true, force: true });

    const api = makeSampleApi();
    expect(() => writeApiNote(vaultPath, api)).not.toThrow();
    expect(fileExists(path.join(vaultPath, "apis", "login.md"))).toBe(true);
  });

  it("overwrites an existing API note", () => {
    const api = makeSampleApi();
    writeApiNote(vaultPath, api);

    const updatedApi: ApiInfo = {
      ...api,
      method: "PUT",
      route: "/api/auth/login/v2",
    };
    writeApiNote(vaultPath, updatedApi);

    const content = readFile(path.join(vaultPath, "apis", "login.md"));
    expect(content).toContain("method: PUT");
    expect(content).toContain("route: /api/auth/login/v2");
    expect(content).not.toContain("method: POST");
  });

  it("handles different HTTP methods", () => {
    const methods: ApiInfo["method"][] = ["GET", "POST", "PUT", "DELETE", "PATCH"];

    for (const method of methods) {
      const api: ApiInfo = {
        name: `endpoint-${method.toLowerCase()}`,
        route: `/api/endpoint`,
        method,
        module: "core",
      };
      writeApiNote(vaultPath, api);

      const content = readFile(
        path.join(vaultPath, "apis", `endpoint-${method.toLowerCase()}.md`),
      );
      expect(content).toContain(`method: ${method}`);
    }
  });
});

// ---------------------------------------------------------------------------
// writeDataModelNote
// ---------------------------------------------------------------------------

describe("writeDataModelNote", () => {
  let tmpDir: string;
  let vaultPath: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    vaultPath = initVault(tmpDir, "hybrid");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates data/<name>.md", () => {
    const model = makeSampleDataModel();
    writeDataModelNote(vaultPath, model);

    expect(fileExists(path.join(vaultPath, "data", "User.md"))).toBe(true);
  });

  it("generates correct frontmatter", () => {
    const model = makeSampleDataModel();
    writeDataModelNote(vaultPath, model);

    const content = readFile(path.join(vaultPath, "data", "User.md"));

    expect(content).toContain("---");
    expect(content).toContain("name: User");
    expect(content).toContain("type: data-model");
    expect(content).toContain("table: users");
    expect(content).toContain("tags: [sdd, auto-generated, data-model]");
    expect(content).toContain("created: ");
  });

  it("generates correct headings", () => {
    const model = makeSampleDataModel();
    writeDataModelNote(vaultPath, model);

    const content = readFile(path.join(vaultPath, "data", "User.md"));

    expect(content).toContain("# Data Model: User");
    expect(content).toContain("## Table");
    expect(content).toContain("## Columns");
  });

  it("lists table name correctly", () => {
    const model = makeSampleDataModel();
    writeDataModelNote(vaultPath, model);

    const content = readFile(path.join(vaultPath, "data", "User.md"));
    expect(content).toContain("**Table name:** `users`");
  });

  it("lists all columns with backtick formatting", () => {
    const model = makeSampleDataModel();
    writeDataModelNote(vaultPath, model);

    const content = readFile(path.join(vaultPath, "data", "User.md"));

    for (const col of model.columns) {
      expect(content).toContain(`- \`${col}\``);
    }
  });

  it("handles models with empty columns", () => {
    const model: DataModelInfo = {
      name: "EmptyModel",
      table: "empty_table",
      columns: [],
    };
    writeDataModelNote(vaultPath, model);

    const content = readFile(path.join(vaultPath, "data", "EmptyModel.md"));
    expect(content).toContain("_No columns defined._");
  });

  it("creates the data directory if it does not exist", () => {
    fs.rmSync(path.join(vaultPath, "data"), { recursive: true, force: true });

    const model = makeSampleDataModel();
    expect(() => writeDataModelNote(vaultPath, model)).not.toThrow();
    expect(fileExists(path.join(vaultPath, "data", "User.md"))).toBe(true);
  });

  it("overwrites an existing data model note", () => {
    const model = makeSampleDataModel();
    writeDataModelNote(vaultPath, model);

    const updatedModel: DataModelInfo = {
      ...model,
      columns: [...model.columns, "updated_at"],
    };
    writeDataModelNote(vaultPath, updatedModel);

    const content = readFile(path.join(vaultPath, "data", "User.md"));
    expect(content).toContain("- `updated_at`");
  });

  it("handles single-column models", () => {
    const model: DataModelInfo = {
      name: "Singleton",
      table: "singleton",
      columns: ["key"],
    };
    writeDataModelNote(vaultPath, model);

    const content = readFile(path.join(vaultPath, "data", "Singleton.md"));
    expect(content).toContain("- `key`");
  });
});

// ---------------------------------------------------------------------------
// writeIndexNote
// ---------------------------------------------------------------------------

describe("writeIndexNote", () => {
  let tmpDir: string;
  let vaultPath: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    vaultPath = initVault(tmpDir, "hybrid");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates README.md at vault root", () => {
    writeIndexNote(vaultPath, [], [], []);

    expect(fileExists(path.join(vaultPath, "README.md"))).toBe(true);
  });

  it("generates a MOC title", () => {
    writeIndexNote(vaultPath, [], [], []);

    const content = readFile(path.join(vaultPath, "README.md"));
    expect(content).toContain("# SDD Vault — Map of Content");
  });

  it("lists modules with wikilinks", () => {
    const modules = makeMultipleModules();
    writeIndexNote(vaultPath, modules, [], []);

    const content = readFile(path.join(vaultPath, "README.md"));

    // Wikilinks format: [[modules/auth|auth]]
    expect(content).toContain("[[modules/auth|auth]]");
    expect(content).toContain("[[modules/database|database]]");
  });

  it("lists APIs with wikilinks and route info", () => {
    const apis = makeMultipleApis();
    writeIndexNote(vaultPath, [], apis, []);

    const content = readFile(path.join(vaultPath, "README.md"));

    expect(content).toContain("[[apis/login|login]] (POST /api/auth/login)");
    expect(content).toContain("[[apis/logout|logout]] (POST /api/auth/logout)");
  });

  it("lists data models with wikilinks and table info", () => {
    const models = makeMultipleModels();
    writeIndexNote(vaultPath, [], [], models);

    const content = readFile(path.join(vaultPath, "README.md"));

    expect(content).toContain("[[data/User|User]] (`users`)");
    expect(content).toContain("[[data/Post|Post]] (`posts`)");
  });

  it("handles empty modules gracefully", () => {
    writeIndexNote(vaultPath, [], [], []);

    const content = readFile(path.join(vaultPath, "README.md"));
    expect(content).toContain("_No modules indexed._");
  });

  it("handles empty APIs gracefully", () => {
    writeIndexNote(vaultPath, [], [], []);

    const content = readFile(path.join(vaultPath, "README.md"));
    expect(content).toContain("_No APIs indexed._");
  });

  it("handles empty data models gracefully", () => {
    writeIndexNote(vaultPath, [], [], []);

    const content = readFile(path.join(vaultPath, "README.md"));
    expect(content).toContain("_No data models indexed._");
  });

  it("generates all three sections (modules, apis, data)", () => {
    const modules = makeMultipleModules();
    const apis = makeMultipleApis();
    const models = makeMultipleModels();

    writeIndexNote(vaultPath, modules, apis, models);

    const content = readFile(path.join(vaultPath, "README.md"));

    expect(content).toContain("## Modules");
    expect(content).toContain("## APIs");
    expect(content).toContain("## Data Models");
  });

  it("uses [[wikilinks]] format not Markdown links", () => {
    const modules = makeMultipleModules();
    writeIndexNote(vaultPath, modules, [], []);

    const content = readFile(path.join(vaultPath, "README.md"));

    // Should use [[path|display]] not [display](path)
    expect(content).toContain("[[modules/auth|auth]]");
    expect(content).not.toMatch(/\[auth\]\(modules\/auth\)/);
  });

  it("overwrites an existing README.md", () => {
    // Write initial README
    writeIndexNote(vaultPath, [], [], []);
    const firstContent = readFile(path.join(vaultPath, "README.md"));
    expect(firstContent).toContain("_No modules indexed._");

    // Write again with modules
    const modules = makeMultipleModules();
    writeIndexNote(vaultPath, modules, [], []);

    const secondContent = readFile(path.join(vaultPath, "README.md"));
    expect(secondContent).not.toContain("_No modules indexed._");
    expect(secondContent).toContain("[[modules/auth|auth]]");
  });
});

// ---------------------------------------------------------------------------
// copyTemplates
// ---------------------------------------------------------------------------

describe("copyTemplates", () => {
  let tmpDir: string;
  let vaultPath: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    vaultPath = initVault(tmpDir, "hybrid");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates daily-journal.md template", () => {
    copyTemplates(vaultPath);

    expect(fileExists(path.join(vaultPath, "templates", "daily-journal.md"))).toBe(
      true,
    );
  });

  it("creates adr.md template", () => {
    copyTemplates(vaultPath);

    expect(fileExists(path.join(vaultPath, "templates", "adr.md"))).toBe(true);
  });

  it("creates sync-log.md template", () => {
    copyTemplates(vaultPath);

    expect(fileExists(path.join(vaultPath, "templates", "sync-log.md"))).toBe(true);
  });

  it("daily-journal.md has correct frontmatter and sections", () => {
    copyTemplates(vaultPath);

    const content = readFile(
      path.join(vaultPath, "templates", "daily-journal.md"),
    );

    expect(content).toContain("---");
    expect(content).toContain("type: daily-journal");
    expect(content).toContain("tags: [journal]");
    expect(content).toContain("date: ");
    expect(content).toContain("# Daily Journal");
    expect(content).toContain("## Standup");
    expect(content).toContain("## Notes");
  });

  it("adr.md has correct frontmatter and sections", () => {
    copyTemplates(vaultPath);

    const content = readFile(path.join(vaultPath, "templates", "adr.md"));

    expect(content).toContain("---");
    expect(content).toContain("type: adr");
    expect(content).toContain("status: proposed");
    expect(content).toContain("tags: [architecture, decision]");
    expect(content).toContain("date: ");
    expect(content).toContain("# ADR: <title>");
    expect(content).toContain("## Context");
    expect(content).toContain("## Decision");
    expect(content).toContain("## Consequences");
    expect(content).toContain("## Alternatives Considered");
  });

  it("sync-log.md has correct frontmatter and sections", () => {
    copyTemplates(vaultPath);

    const content = readFile(path.join(vaultPath, "templates", "sync-log.md"));

    expect(content).toContain("---");
    expect(content).toContain("type: sync-log");
    expect(content).toContain("tags: [sync, auto-generated]");
    expect(content).toContain("date: ");
    expect(content).toContain("# Sync Log");
    expect(content).toContain("## Summary");
    expect(content).toContain("## Module Changes");
    expect(content).toContain("## API Changes");
    expect(content).toContain("## Data Model Changes");
  });

  it("creates exactly three template files", () => {
    copyTemplates(vaultPath);

    const templateFiles = listDirEntries(
      path.join(vaultPath, "templates"),
    ).sort();
    expect(templateFiles).toEqual([
      "adr.md",
      "daily-journal.md",
      "sync-log.md",
    ]);
  });

  it("does not overwrite existing templates", () => {
    copyTemplates(vaultPath);

    // Modify an existing template to simulate user customization
    const journalPath = path.join(vaultPath, "templates", "daily-journal.md");
    const customContent = "---\ncustom: true\n---\n# Custom Journal";
    writeFile(journalPath, customContent);

    // Second call should preserve the custom content
    copyTemplates(vaultPath);

    const content = readFile(journalPath);
    expect(content).toBe(customContent);
  });

  it("creates templates directory if it does not exist", () => {
    fs.rmSync(path.join(vaultPath, "templates"), { recursive: true, force: true });

    copyTemplates(vaultPath);

    expect(fileExists(path.join(vaultPath, "templates", "daily-journal.md"))).toBe(
      true,
    );
  });

  it("is idempotent — running twice does not error", () => {
    copyTemplates(vaultPath);
    expect(() => copyTemplates(vaultPath)).not.toThrow();

    // All three files still exist
    expect(fileExists(path.join(vaultPath, "templates", "daily-journal.md"))).toBe(true);
    expect(fileExists(path.join(vaultPath, "templates", "adr.md"))).toBe(true);
    expect(fileExists(path.join(vaultPath, "templates", "sync-log.md"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: full vault population workflow
// ---------------------------------------------------------------------------

describe("full vault population workflow", () => {
  let tmpDir: string;
  let vaultPath: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    vaultPath = initVault(tmpDir, "hybrid");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("populates a complete vault with modules, APIs, data models, templates, and index", () => {
    // Arrange
    const modules = makeMultipleModules();
    const apis = makeMultipleApis();
    const models = makeMultipleModels();

    // Act
    for (const mod of modules) {
      writeModuleNote(vaultPath, mod);
    }
    for (const api of apis) {
      writeApiNote(vaultPath, api);
    }
    for (const model of models) {
      writeDataModelNote(vaultPath, model);
    }
    copyTemplates(vaultPath);
    writeIndexNote(vaultPath, modules, apis, models);

    // Assert: all files exist
    expect(fileExists(path.join(vaultPath, "modules", "auth.md"))).toBe(true);
    expect(fileExists(path.join(vaultPath, "modules", "database.md"))).toBe(true);
    expect(fileExists(path.join(vaultPath, "apis", "login.md"))).toBe(true);
    expect(fileExists(path.join(vaultPath, "apis", "logout.md"))).toBe(true);
    expect(fileExists(path.join(vaultPath, "data", "User.md"))).toBe(true);
    expect(fileExists(path.join(vaultPath, "data", "Post.md"))).toBe(true);
    expect(fileExists(path.join(vaultPath, "templates", "daily-journal.md"))).toBe(
      true,
    );
    expect(fileExists(path.join(vaultPath, "templates", "adr.md"))).toBe(true);
    expect(fileExists(path.join(vaultPath, "templates", "sync-log.md"))).toBe(true);
    expect(fileExists(path.join(vaultPath, "README.md"))).toBe(true);

    // Assert: README has cross-references via wikilinks
    const readme = readFile(path.join(vaultPath, "README.md"));
    expect(readme).toContain("[[modules/auth|auth]]");
    expect(readme).toContain("[[apis/login|login]]");
    expect(readme).toContain("[[data/User|User]]");

    // Assert: API notes link back to modules
    const apiNote = readFile(path.join(vaultPath, "apis", "login.md"));
    expect(apiNote).toContain("[[modules/auth|auth]]");
  });

  it("produces a valid Obsidian vault that Obsidian can open", () => {
    // A valid Obsidian vault requires:
    // 1. A root directory
    // 2. A .obsidian/ directory with at least an app.json
    // 3. Markdown files are valid

    const modules = makeMultipleModules();
    writeModuleNote(vaultPath, modules[0]);
    writeIndexNote(vaultPath, modules, [], []);

    // Check .obsidian/ exists with app.json
    expect(dirExists(path.join(vaultPath, ".obsidian"))).toBe(true);
    expect(fileExists(path.join(vaultPath, ".obsidian", "app.json"))).toBe(true);

    // Check app.json has valid JSON
    const appConfig = JSON.parse(
      readFile(path.join(vaultPath, ".obsidian", "app.json")),
    );
    expect(typeof appConfig.vaultName).toBe("string");
    expect(appConfig.vaultName.length).toBeGreaterThan(0);

    // Check markdown files have valid YAML frontmatter (at least the --- delimiters)
    const readme = readFile(path.join(vaultPath, "README.md"));
    const moduleNote = readFile(path.join(vaultPath, "modules", "auth.md"));

    // README doesn't need frontmatter, but module notes do
    expect(moduleNote.startsWith("---")).toBe(true);
    const frontmatterEnd = moduleNote.indexOf("---", 4);
    expect(frontmatterEnd).toBeGreaterThan(0);
  });

  it("creates wikilinks that resolve within the vault structure", () => {
    // The wikilinks in notes should reference files that actually exist
    const modules = makeMultipleModules();
    const apis = makeMultipleApis();

    for (const mod of modules) {
      writeModuleNote(vaultPath, mod);
    }
    for (const api of apis) {
      writeApiNote(vaultPath, api);
    }
    writeIndexNote(vaultPath, modules, apis, []);

    // Verify that a wikilink [[modules/auth|auth]] points to an existing file
    // Obsidian resolves [[modules/auth]] to modules/auth.md
    expect(fileExists(path.join(vaultPath, "modules", "auth.md"))).toBe(true);
    expect(fileExists(path.join(vaultPath, "modules", "database.md"))).toBe(true);
    expect(fileExists(path.join(vaultPath, "apis", "login.md"))).toBe(true);
    expect(fileExists(path.join(vaultPath, "apis", "logout.md"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// todayString format validation
// ---------------------------------------------------------------------------

describe("date format in frontmatter", () => {
  let tmpDir: string;
  let vaultPath: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    vaultPath = initVault(tmpDir, "hybrid");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uses ISO date format (YYYY-MM-DD)", () => {
    const mod = makeSampleModule();
    writeModuleNote(vaultPath, mod);

    const content = readFile(path.join(vaultPath, "modules", "auth.md"));
    // Extract the created date
    const match = content.match(/created: (\S+)/);
    expect(match).not.toBeNull();

    const date = match![1];
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("all generated notes have consistent created dates", () => {
    const mod = makeSampleModule();
    const api = makeSampleApi();
    const model = makeSampleDataModel();

    writeModuleNote(vaultPath, mod);
    writeApiNote(vaultPath, api);
    writeDataModelNote(vaultPath, model);

    const moduleContent = readFile(
      path.join(vaultPath, "modules", "auth.md"),
    );
    const apiContent = readFile(path.join(vaultPath, "apis", "login.md"));
    const dataContent = readFile(path.join(vaultPath, "data", "User.md"));

    const moduleDate = moduleContent.match(/created: (\S+)/)![1];
    const apiDate = apiContent.match(/created: (\S+)/)![1];
    const dataDate = dataContent.match(/created: (\S+)/)![1];

    // All should be the same day
    expect(moduleDate).toBe(apiDate);
    expect(apiDate).toBe(dataDate);
  });
});
