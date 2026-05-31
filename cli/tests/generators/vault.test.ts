import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  generateModuleNotes,
  generateApiNotes,
  generateDataModelNotes,
  generateIndexNote,
} from "../../src/generators/vault.js";
import type { ModuleInfo } from "../../src/integrations/codegraph.js";
import type { ApiInfo, DataModelInfo } from "../../src/integrations/obsidian.js";
import type { ModuleTopology } from "../../src/analyzers/structure.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sdd-vault-test-"));
}

function readFile(fp: string): string {
  return fs.readFileSync(fp, "utf-8");
}

function fileExists(fp: string): boolean {
  try {
    return fs.statSync(fp).isFile();
  } catch {
    return false;
  }
}

function dirExists(fp: string): boolean {
  try {
    return fs.statSync(fp).isDirectory();
  } catch {
    return false;
  }
}

function writeFile(fp: string, content: string): void {
  const dir = path.dirname(fp);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fp, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeSampleModule(overrides?: Partial<ModuleInfo>): ModuleInfo {
  return {
    name: "auth",
    path: "src/auth",
    files: ["src/auth/login.ts", "src/auth/logout.ts", "src/auth/session.ts"],
    exports: ["login", "logout", "validateSession"],
    ...overrides,
  };
}

function makeSampleApi(overrides?: Partial<ApiInfo>): ApiInfo {
  return {
    name: "get-users",
    route: "/api/users",
    method: "GET",
    module: "user-service",
    ...overrides,
  };
}

function makeSampleDataModel(overrides?: Partial<DataModelInfo>): DataModelInfo {
  return {
    name: "User",
    table: "users",
    columns: ["id", "email", "name", "created_at"],
    ...overrides,
  };
}

function makeEmptyModules(): ModuleInfo[] {
  return [];
}

function makeSingleModule(): ModuleInfo[] {
  return [makeSampleModule()];
}

function makeMultipleModules(): ModuleInfo[] {
  return [
    makeSampleModule(),
    makeSampleModule({ name: "database", path: "src/database", files: ["src/database/connection.ts"], exports: ["connect", "query"] }),
    makeSampleModule({ name: "utils", path: "src/utils", files: ["src/utils/helpers.ts"], exports: ["formatDate"] }),
  ];
}

function makeSingleApi(): ApiInfo[] {
  return [makeSampleApi()];
}

function makeMultipleApis(): ApiInfo[] {
  return [
    makeSampleApi(),
    { name: "create-user", route: "/api/users", method: "POST", module: "user-service" },
    { name: "delete-user", route: "/api/users/:id", method: "DELETE", module: "user-service" },
  ];
}

function makeSingleDataModel(): DataModelInfo[] {
  return [makeSampleDataModel()];
}

function makeMultipleDataModels(): DataModelInfo[] {
  return [
    makeSampleDataModel(),
    { name: "Post", table: "posts", columns: ["id", "title", "body", "user_id"] },
    { name: "Comment", table: "comments", columns: ["id", "post_id", "user_id", "body"] },
  ];
}

function makeEmptyTopology(): ModuleTopology {
  return {
    modules: [],
    edges: [],
    entryPoints: [],
  };
}

function makeTopologyWithModules(modules: ModuleInfo[]): ModuleTopology {
  return {
    modules,
    edges: [],
    entryPoints: [],
  };
}

// ---------------------------------------------------------------------------
// generateModuleNotes
// ---------------------------------------------------------------------------

describe("generateModuleNotes", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the vaultPath/modules directory", () => {
    generateModuleNotes(makeSingleModule(), tmpDir);

    expect(dirExists(path.join(tmpDir, "modules"))).toBe(true);
  });

  it("writes one note per module", () => {
    const modules = makeMultipleModules();
    generateModuleNotes(modules, tmpDir);

    for (const mod of modules) {
      const notePath = path.join(tmpDir, "modules", `${mod.name}.md`);
      expect(fileExists(notePath)).toBe(true);
    }
  });

  it("generates a module note with correct heading", () => {
    generateModuleNotes(makeSingleModule(), tmpDir);

    const content = readFile(path.join(tmpDir, "modules", "auth.md"));
    expect(content).toContain("# [[auth]]");
  });

  it("includes YAML frontmatter with module name", () => {
    generateModuleNotes(makeSingleModule(), tmpDir);

    const content = readFile(path.join(tmpDir, "modules", "auth.md"));
    expect(content).toContain("module: auth");
    expect(content).toContain("type: module");
    expect(content).toContain("tags: [sdd, auto-generated]");
  });

  it("includes frontmatter delimiters", () => {
    generateModuleNotes(makeSingleModule(), tmpDir);

    const content = readFile(path.join(tmpDir, "modules", "auth.md"));
    const frontmatterCount = (content.match(/^---$/gm) ?? []).length;
    expect(frontmatterCount).toBe(2);
  });

  it("lists all files in the module", () => {
    generateModuleNotes(makeSingleModule(), tmpDir);

    const content = readFile(path.join(tmpDir, "modules", "auth.md"));
    expect(content).toContain("- src/auth/login.ts");
    expect(content).toContain("- src/auth/logout.ts");
    expect(content).toContain("- src/auth/session.ts");
  });

  it("shows placeholder when module has no files", () => {
    const mod: ModuleInfo = {
      name: "empty-module",
      path: "src/empty",
      files: [],
      exports: [],
    };
    generateModuleNotes([mod], tmpDir);

    const content = readFile(path.join(tmpDir, "modules", "empty-module.md"));
    expect(content).toContain("_No files._");
  });

  it("lists all exports in the module", () => {
    generateModuleNotes(makeSingleModule(), tmpDir);

    const content = readFile(path.join(tmpDir, "modules", "auth.md"));
    expect(content).toContain("- login");
    expect(content).toContain("- logout");
    expect(content).toContain("- validateSession");
  });

  it("shows placeholder when module has no exports", () => {
    const mod: ModuleInfo = {
      name: "no-exports",
      path: "src/no-exports",
      files: ["src/no-exports/index.ts"],
      exports: [],
    };
    generateModuleNotes([mod], tmpDir);

    const content = readFile(path.join(tmpDir, "modules", "no-exports.md"));
    expect(content).toContain("_No exports detected._");
  });

  it("handles empty modules array gracefully", () => {
    expect(() => generateModuleNotes(makeEmptyModules(), tmpDir)).not.toThrow();
    expect(dirExists(path.join(tmpDir, "modules"))).toBe(true);
  });

  it("handles a single module", () => {
    generateModuleNotes(makeSingleModule(), tmpDir);

    const notePath = path.join(tmpDir, "modules", "auth.md");
    expect(fileExists(notePath)).toBe(true);
  });

  it("handles multiple modules with different names", () => {
    const modules = makeMultipleModules();
    generateModuleNotes(modules, tmpDir);

    for (const mod of modules) {
      expect(fileExists(path.join(tmpDir, "modules", `${mod.name}.md`))).toBe(true);
    }
  });

  it("does not mutate the input modules array", () => {
    const modules = makeMultipleModules();
    const countBefore = modules.length;
    const firstExportsBefore = modules[0].exports.length;

    generateModuleNotes(modules, tmpDir);

    expect(modules.length).toBe(countBefore);
    expect(modules[0].exports.length).toBe(firstExportsBefore);
  });

  it("overwrites existing module notes", () => {
    generateModuleNotes(makeSingleModule(), tmpDir);

    const updated: ModuleInfo = {
      name: "auth",
      path: "src/auth",
      files: ["src/auth/login.ts"],
      exports: ["login"],
    };
    generateModuleNotes([updated], tmpDir);

    const content = readFile(path.join(tmpDir, "modules", "auth.md"));
    expect(content).toContain("- src/auth/login.ts");
    expect(content).not.toContain("- src/auth/logout.ts");
    expect(content).not.toContain("- validateSession");
  });
});

// ---------------------------------------------------------------------------
// generateApiNotes
// ---------------------------------------------------------------------------

describe("generateApiNotes", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the vaultPath/apis directory", () => {
    generateApiNotes(makeSingleApi(), tmpDir);

    expect(dirExists(path.join(tmpDir, "apis"))).toBe(true);
  });

  it("writes one note per API", () => {
    const apis = makeMultipleApis();
    generateApiNotes(apis, tmpDir);

    for (const api of apis) {
      const notePath = path.join(tmpDir, "apis", `${api.name}.md`);
      expect(fileExists(notePath)).toBe(true);
    }
  });

  it("generates an API note with correct heading wikilink", () => {
    generateApiNotes(makeSingleApi(), tmpDir);

    const content = readFile(path.join(tmpDir, "apis", "get-users.md"));
    expect(content).toContain("# [[apis/get-users|get-users]]");
  });

  it("includes YAML frontmatter with module and type", () => {
    generateApiNotes(makeSingleApi(), tmpDir);

    const content = readFile(path.join(tmpDir, "apis", "get-users.md"));
    expect(content).toContain("module: user-service");
    expect(content).toContain("type: api");
    expect(content).toContain("tags: [sdd, auto-generated]");
  });

  it("includes frontmatter delimiters", () => {
    generateApiNotes(makeSingleApi(), tmpDir);

    const content = readFile(path.join(tmpDir, "apis", "get-users.md"));
    const frontmatterCount = (content.match(/^---$/gm) ?? []).length;
    expect(frontmatterCount).toBe(2);
  });

  it("includes route and method", () => {
    generateApiNotes(makeSingleApi(), tmpDir);

    const content = readFile(path.join(tmpDir, "apis", "get-users.md"));
    expect(content).toContain("**Route:** `/api/users`");
    expect(content).toContain("**Method:** `GET`");
  });

  it("includes module wikilink", () => {
    generateApiNotes(makeSingleApi(), tmpDir);

    const content = readFile(path.join(tmpDir, "apis", "get-users.md"));
    expect(content).toContain("**Module:** [[user-service]]");
  });

  it("handles POST method", () => {
    const apis: ApiInfo[] = [
      { name: "create-item", route: "/api/items", method: "POST", module: "items" },
    ];
    generateApiNotes(apis, tmpDir);

    const content = readFile(path.join(tmpDir, "apis", "create-item.md"));
    expect(content).toContain("**Method:** `POST`");
    expect(content).toContain("**Module:** [[items]]");
  });

  it("handles DELETE method", () => {
    const apis: ApiInfo[] = [
      { name: "remove-item", route: "/api/items/:id", method: "DELETE", module: "items" },
    ];
    generateApiNotes(apis, tmpDir);

    const content = readFile(path.join(tmpDir, "apis", "remove-item.md"));
    expect(content).toContain("**Method:** `DELETE`");
    expect(content).toContain("**Route:** `/api/items/:id`");
  });

  it("handles empty APIs array gracefully", () => {
    expect(() => generateApiNotes([], tmpDir)).not.toThrow();
    expect(dirExists(path.join(tmpDir, "apis"))).toBe(true);
  });

  it("handles multiple APIs", () => {
    const apis = makeMultipleApis();
    generateApiNotes(apis, tmpDir);

    for (const api of apis) {
      expect(fileExists(path.join(tmpDir, "apis", `${api.name}.md`))).toBe(true);
    }
  });

  it("does not mutate the input APIs array", () => {
    const apis = makeMultipleApis();
    const countBefore = apis.length;

    generateApiNotes(apis, tmpDir);

    expect(apis.length).toBe(countBefore);
  });

  it("overwrites existing API notes", () => {
    generateApiNotes(makeSingleApi(), tmpDir);

    const updated: ApiInfo = {
      name: "get-users",
      route: "/api/v2/users",
      method: "GET",
      module: "user-service-v2",
    };
    generateApiNotes([updated], tmpDir);

    const content = readFile(path.join(tmpDir, "apis", "get-users.md"));
    expect(content).toContain("**Route:** `/api/v2/users`");
    expect(content).not.toContain("/api/users`");
  });
});

// ---------------------------------------------------------------------------
// generateDataModelNotes
// ---------------------------------------------------------------------------

describe("generateDataModelNotes", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the vaultPath/data directory", () => {
    generateDataModelNotes(makeSingleDataModel(), tmpDir);

    expect(dirExists(path.join(tmpDir, "data"))).toBe(true);
  });

  it("writes one note per data model", () => {
    const models = makeMultipleDataModels();
    generateDataModelNotes(models, tmpDir);

    for (const model of models) {
      const notePath = path.join(tmpDir, "data", `${model.name}.md`);
      expect(fileExists(notePath)).toBe(true);
    }
  });

  it("generates a data model note with correct heading wikilink", () => {
    generateDataModelNotes(makeSingleDataModel(), tmpDir);

    const content = readFile(path.join(tmpDir, "data", "User.md"));
    expect(content).toContain("# [[data/User|User]]");
  });

  it("includes YAML frontmatter with model name", () => {
    generateDataModelNotes(makeSingleDataModel(), tmpDir);

    const content = readFile(path.join(tmpDir, "data", "User.md"));
    expect(content).toContain("name: User");
    expect(content).toContain("type: data-model");
    expect(content).toContain("tags: [sdd, auto-generated]");
  });

  it("includes frontmatter delimiters", () => {
    generateDataModelNotes(makeSingleDataModel(), tmpDir);

    const content = readFile(path.join(tmpDir, "data", "User.md"));
    const frontmatterCount = (content.match(/^---$/gm) ?? []).length;
    expect(frontmatterCount).toBe(2);
  });

  it("includes table name", () => {
    generateDataModelNotes(makeSingleDataModel(), tmpDir);

    const content = readFile(path.join(tmpDir, "data", "User.md"));
    expect(content).toContain("**Table:** `users`");
  });

  it("lists all columns", () => {
    generateDataModelNotes(makeSingleDataModel(), tmpDir);

    const content = readFile(path.join(tmpDir, "data", "User.md"));
    expect(content).toContain("- `id`");
    expect(content).toContain("- `email`");
    expect(content).toContain("- `name`");
    expect(content).toContain("- `created_at`");
  });

  it("shows placeholder when model has no columns", () => {
    const models: DataModelInfo[] = [
      { name: "Empty", table: "empty_table", columns: [] },
    ];
    generateDataModelNotes(models, tmpDir);

    const content = readFile(path.join(tmpDir, "data", "Empty.md"));
    expect(content).toContain("_No columns defined._");
  });

  it("handles empty models array gracefully", () => {
    expect(() => generateDataModelNotes([], tmpDir)).not.toThrow();
    expect(dirExists(path.join(tmpDir, "data"))).toBe(true);
  });

  it("handles a single data model", () => {
    generateDataModelNotes(makeSingleDataModel(), tmpDir);

    expect(fileExists(path.join(tmpDir, "data", "User.md"))).toBe(true);
  });

  it("handles multiple data models", () => {
    const models = makeMultipleDataModels();
    generateDataModelNotes(models, tmpDir);

    for (const model of models) {
      expect(fileExists(path.join(tmpDir, "data", `${model.name}.md`))).toBe(true);
    }
  });

  it("does not mutate the input models array", () => {
    const models = makeMultipleDataModels();
    const countBefore = models.length;

    generateDataModelNotes(models, tmpDir);

    expect(models.length).toBe(countBefore);
  });

  it("overwrites existing data model notes", () => {
    generateDataModelNotes(makeSingleDataModel(), tmpDir);

    const updated: DataModelInfo = {
      name: "User",
      table: "app_users",
      columns: ["id", "email"],
    };
    generateDataModelNotes([updated], tmpDir);

    const content = readFile(path.join(tmpDir, "data", "User.md"));
    expect(content).toContain("**Table:** `app_users`");
    expect(content).toContain("- `id`");
    expect(content).toContain("- `email`");
    expect(content).not.toContain("- `name`");
  });

  it("includes Columns section heading", () => {
    generateDataModelNotes(makeSingleDataModel(), tmpDir);

    const content = readFile(path.join(tmpDir, "data", "User.md"));
    expect(content).toContain("## Columns");
  });
});

// ---------------------------------------------------------------------------
// generateIndexNote
// ---------------------------------------------------------------------------

describe("generateIndexNote", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates index.md at the vault root", () => {
    generateIndexNote(makeEmptyTopology(), tmpDir);

    expect(fileExists(path.join(tmpDir, "index.md"))).toBe(true);
  });

  it("includes MOC frontmatter", () => {
    generateIndexNote(makeEmptyTopology(), tmpDir);

    const content = readFile(path.join(tmpDir, "index.md"));
    expect(content).toContain("type: moc");
    expect(content).toContain("tags: [sdd, auto-generated]");
  });

  it("includes frontmatter delimiters", () => {
    generateIndexNote(makeEmptyTopology(), tmpDir);

    const content = readFile(path.join(tmpDir, "index.md"));
    const frontmatterCount = (content.match(/^---$/gm) ?? []).length;
    expect(frontmatterCount).toBe(2);
  });

  it("shows project title", () => {
    generateIndexNote(makeEmptyTopology(), tmpDir);

    const content = readFile(path.join(tmpDir, "index.md"));
    expect(content).toContain("# Project Modules");
  });

  it("shows placeholder when no modules exist", () => {
    generateIndexNote(makeEmptyTopology(), tmpDir);

    const content = readFile(path.join(tmpDir, "index.md"));
    expect(content).toContain("_No modules indexed yet._");
  });

  it("lists module wikilinks sorted alphabetically", () => {
    const modules: ModuleInfo[] = [
      { name: "database", path: "src/database", files: [], exports: [] },
      { name: "auth", path: "src/auth", files: [], exports: [] },
      { name: "utils", path: "src/utils", files: [], exports: [] },
    ];
    const topology = makeTopologyWithModules(modules);
    generateIndexNote(topology, tmpDir);

    const content = readFile(path.join(tmpDir, "index.md"));
    const authIndex = content.indexOf("[[modules/auth|auth]]");
    const databaseIndex = content.indexOf("[[modules/database|database]]");
    const utilsIndex = content.indexOf("[[modules/utils|utils]]");

    expect(authIndex).toBeLessThan(databaseIndex);
    expect(databaseIndex).toBeLessThan(utilsIndex);
  });

  it("handles single module in index", () => {
    const topology = makeTopologyWithModules(makeSingleModule());
    generateIndexNote(topology, tmpDir);

    const content = readFile(path.join(tmpDir, "index.md"));
    expect(content).toContain("[[modules/auth|auth]]");
    expect(content).not.toContain("_No modules indexed yet._");
  });

  it("handles multiple modules in index", () => {
    const topology = makeTopologyWithModules(makeMultipleModules());
    generateIndexNote(topology, tmpDir);

    const content = readFile(path.join(tmpDir, "index.md"));
    expect(content).toContain("[[modules/auth|auth]]");
    expect(content).toContain("[[modules/database|database]]");
    expect(content).toContain("[[modules/utils|utils]]");
  });

  it("discovers API notes from vault filesystem", () => {
    // Pre-generate some API notes so the index can discover them
    const apisDir = path.join(tmpDir, "apis");
    fs.mkdirSync(apisDir, { recursive: true });
    writeFile(path.join(apisDir, "get-users.md"), "dummy");
    writeFile(path.join(apisDir, "create-user.md"), "dummy");

    const topology = makeTopologyWithModules(makeSingleModule());
    generateIndexNote(topology, tmpDir);

    const content = readFile(path.join(tmpDir, "index.md"));
    expect(content).toContain("[[apis/create-user|create-user]]");
    expect(content).toContain("[[apis/get-users|get-users]]");
  });

  it("discovers data model notes from vault filesystem", () => {
    // Pre-generate some data model notes so the index can discover them
    const dataDir = path.join(tmpDir, "data");
    fs.mkdirSync(dataDir, { recursive: true });
    writeFile(path.join(dataDir, "User.md"), "dummy");
    writeFile(path.join(dataDir, "Post.md"), "dummy");

    const topology = makeTopologyWithModules(makeSingleModule());
    generateIndexNote(topology, tmpDir);

    const content = readFile(path.join(tmpDir, "index.md"));
    expect(content).toContain("[[data/Post|Post]]");
    expect(content).toContain("[[data/User|User]]");
  });

  it("shows placeholder when no API notes exist", () => {
    const topology = makeTopologyWithModules(makeSingleModule());
    generateIndexNote(topology, tmpDir);

    const content = readFile(path.join(tmpDir, "index.md"));
    expect(content).toContain("_No APIs indexed yet._");
  });

  it("shows placeholder when no data model notes exist", () => {
    const topology = makeTopologyWithModules(makeSingleModule());
    generateIndexNote(topology, tmpDir);

    const content = readFile(path.join(tmpDir, "index.md"));
    expect(content).toContain("_No data models indexed yet._");
  });

  it("sorts API wikilinks alphabetically", () => {
    const apisDir = path.join(tmpDir, "apis");
    fs.mkdirSync(apisDir, { recursive: true });
    writeFile(path.join(apisDir, "z-endpoint.md"), "dummy");
    writeFile(path.join(apisDir, "a-endpoint.md"), "dummy");

    const topology = makeTopologyWithModules(makeSingleModule());
    generateIndexNote(topology, tmpDir);

    const content = readFile(path.join(tmpDir, "index.md"));
    const aIndex = content.indexOf("[[apis/a-endpoint|a-endpoint]]");
    const zIndex = content.indexOf("[[apis/z-endpoint|z-endpoint]]");

    expect(aIndex).toBeLessThan(zIndex);
  });

  it("sorts data model wikilinks alphabetically", () => {
    const dataDir = path.join(tmpDir, "data");
    fs.mkdirSync(dataDir, { recursive: true });
    writeFile(path.join(dataDir, "Zebra.md"), "dummy");
    writeFile(path.join(dataDir, "Alpha.md"), "dummy");

    const topology = makeTopologyWithModules(makeSingleModule());
    generateIndexNote(topology, tmpDir);

    const content = readFile(path.join(tmpDir, "index.md"));
    const alphaIndex = content.indexOf("[[data/Alpha|Alpha]]");
    const zebraIndex = content.indexOf("[[data/Zebra|Zebra]]");

    expect(alphaIndex).toBeLessThan(zebraIndex);
  });

  it("does not mutate the input topology", () => {
    const topology = makeTopologyWithModules(makeMultipleModules());
    const moduleCountBefore = topology.modules.length;

    generateIndexNote(topology, tmpDir);

    expect(topology.modules.length).toBe(moduleCountBefore);
  });

  it("overwrites existing index note", () => {
    const topology = makeTopologyWithModules(makeSingleModule());
    generateIndexNote(topology, tmpDir);

    const updatedModules: ModuleInfo[] = [
      { name: "new-module", path: "src/new", files: [], exports: [] },
    ];
    const updatedTopology = makeTopologyWithModules(updatedModules);
    generateIndexNote(updatedTopology, tmpDir);

    const content = readFile(path.join(tmpDir, "index.md"));
    expect(content).toContain("[[modules/new-module|new-module]]");
    expect(content).not.toContain("[[modules/auth|auth]]");
  });

  it("includes all three sections (Modules, APIs, Data Models)", () => {
    generateIndexNote(makeEmptyTopology(), tmpDir);

    const content = readFile(path.join(tmpDir, "index.md"));
    expect(content).toContain("## Modules");
    expect(content).toContain("## APIs");
    expect(content).toContain("## Data Models");
  });

  it("index has correct wikilink format with display alias", () => {
    const topology = makeTopologyWithModules(makeSingleModule());
    generateIndexNote(topology, tmpDir);

    const content = readFile(path.join(tmpDir, "index.md"));
    // Should use [[path|display]] format
    expect(content).toContain("[[modules/auth|auth]]");
  });
});

// ---------------------------------------------------------------------------
// Integration: full vault generation workflow
// ---------------------------------------------------------------------------

describe("full vault generation workflow", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates all note types and index together", () => {
    // Arrange
    const modules = makeMultipleModules();
    const apis = makeMultipleApis();
    const models = makeMultipleDataModels();
    const topology = makeTopologyWithModules(modules);

    // Act
    generateModuleNotes(modules, tmpDir);
    generateApiNotes(apis, tmpDir);
    generateDataModelNotes(models, tmpDir);
    generateIndexNote(topology, tmpDir);

    // Assert: all directories created
    expect(dirExists(path.join(tmpDir, "modules"))).toBe(true);
    expect(dirExists(path.join(tmpDir, "apis"))).toBe(true);
    expect(dirExists(path.join(tmpDir, "data"))).toBe(true);

    // Assert: all module notes exist
    for (const mod of modules) {
      expect(fileExists(path.join(tmpDir, "modules", `${mod.name}.md`))).toBe(true);
    }

    // Assert: all API notes exist
    for (const api of apis) {
      expect(fileExists(path.join(tmpDir, "apis", `${api.name}.md`))).toBe(true);
    }

    // Assert: all data model notes exist
    for (const model of models) {
      expect(fileExists(path.join(tmpDir, "data", `${model.name}.md`))).toBe(true);
    }

    // Assert: index exists
    expect(fileExists(path.join(tmpDir, "index.md"))).toBe(true);

    // Assert: index references all modules
    const indexContent = readFile(path.join(tmpDir, "index.md"));
    for (const mod of modules) {
      expect(indexContent).toContain(`[[modules/${mod.name}|${mod.name}]]`);
    }

    // Assert: index references all APIs (discovered from filesystem)
    for (const api of apis) {
      expect(indexContent).toContain(`[[apis/${api.name}|${api.name}]]`);
    }

    // Assert: index references all data models (discovered from filesystem)
    for (const model of models) {
      expect(indexContent).toContain(`[[data/${model.name}|${model.name}]]`);
    }
  });

  it("every note has correct frontmatter (module notes)", () => {
    generateModuleNotes(makeSingleModule(), tmpDir);

    const content = readFile(path.join(tmpDir, "modules", "auth.md"));
    expect(content).toMatch(/^---\n/);
    expect(content).toContain("module: auth");
    expect(content).toContain("type: module");
    expect(content).toContain("tags: [sdd, auto-generated]");
  });

  it("every note has correct frontmatter (API notes)", () => {
    generateApiNotes(makeSingleApi(), tmpDir);

    const content = readFile(path.join(tmpDir, "apis", "get-users.md"));
    expect(content).toMatch(/^---\n/);
    expect(content).toContain("module: user-service");
    expect(content).toContain("type: api");
    expect(content).toContain("tags: [sdd, auto-generated]");
  });

  it("every note has correct frontmatter (data model notes)", () => {
    generateDataModelNotes(makeSingleDataModel(), tmpDir);

    const content = readFile(path.join(tmpDir, "data", "User.md"));
    expect(content).toMatch(/^---\n/);
    expect(content).toContain("name: User");
    expect(content).toContain("type: data-model");
    expect(content).toContain("tags: [sdd, auto-generated]");
  });

  it("index note has correct frontmatter", () => {
    generateIndexNote(makeEmptyTopology(), tmpDir);

    const content = readFile(path.join(tmpDir, "index.md"));
    expect(content).toMatch(/^---\n/);
    expect(content).toContain("type: moc");
    expect(content).toContain("tags: [sdd, auto-generated]");
  });

  it("module note wikilinks use correct format", () => {
    generateModuleNotes(makeSingleModule(), tmpDir);

    const content = readFile(path.join(tmpDir, "modules", "auth.md"));
    // Self-referencing [[wikilink]] as heading
    expect(content).toContain("# [[auth]]");
  });

  it("API note wikilinks use correct format", () => {
    generateApiNotes(makeSingleApi(), tmpDir);

    const content = readFile(path.join(tmpDir, "apis", "get-users.md"));
    // [[path|display]] format
    expect(content).toContain("# [[apis/get-users|get-users]]");
    // Module backlink
    expect(content).toContain("**Module:** [[user-service]]");
  });

  it("data model note wikilinks use correct format", () => {
    generateDataModelNotes(makeSingleDataModel(), tmpDir);

    const content = readFile(path.join(tmpDir, "data", "User.md"));
    expect(content).toContain("# [[data/User|User]]");
  });

  it("generation is idempotent -- running twice does not throw", () => {
    const modules = makeMultipleModules();
    const apis = makeMultipleApis();
    const models = makeMultipleDataModels();
    const topology = makeTopologyWithModules(modules);

    generateModuleNotes(modules, tmpDir);
    generateApiNotes(apis, tmpDir);
    generateDataModelNotes(models, tmpDir);
    generateIndexNote(topology, tmpDir);

    expect(() => {
      generateModuleNotes(modules, tmpDir);
      generateApiNotes(apis, tmpDir);
      generateDataModelNotes(models, tmpDir);
      generateIndexNote(topology, tmpDir);
    }).not.toThrow();
  });
});
