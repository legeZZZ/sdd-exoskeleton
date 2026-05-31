import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  generateModuleSpecs,
  generateSchemas,
  generateChangeProposal,
} from "../../src/generators/specs.js";
import type { SymbolChange } from "../../src/generators/specs.js";
import type { ModuleInfo, DepEdge } from "../../src/integrations/codegraph.js";
import type { ModuleTopology } from "../../src/analyzers/structure.js";


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sdd-specs-test-"));
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

function listFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
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

function makeSampleModuleWithClasses(overrides?: Partial<ModuleInfo>): ModuleInfo {
  return {
    name: "user-service",
    path: "src/services",
    files: ["src/services/user.ts", "src/services/user.test.ts"],
    exports: ["UserService", "createUser", "deleteUser"],
    ...overrides,
  };
}

function makeEmptyTopology(): ModuleTopology {
  return {
    modules: [],
    edges: [],
    entryPoints: [],
  };
}

function makeTopologyWithOneModule(): ModuleTopology {
  return {
    modules: [makeSampleModule()],
    edges: [],
    entryPoints: ["src/auth/login.ts"],
  };
}

function makeTopologyWithMultipleModules(): ModuleTopology {
  return {
    modules: [
      makeSampleModule(),
      makeSampleModuleWithClasses(),
      {
        name: "database",
        path: "src/database",
        files: ["src/database/connection.ts", "src/database/queries.ts"],
        exports: ["connect", "disconnect", "query"],
      },
    ],
    edges: [],
    entryPoints: ["src/auth/login.ts", "src/database/connection.ts"],
  };
}

function makeTopologyWithDependencies(): ModuleTopology {
  const edges: DepEdge[] = [
    { source: "auth", target: "database", type: "import" },
    { source: "auth", target: "utils", type: "call" },
    { source: "user-service", target: "database", type: "import" },
    { source: "user-service", target: "auth", type: "call" },
  ];

  return {
    modules: [
      makeSampleModule(),
      makeSampleModuleWithClasses(),
      {
        name: "database",
        path: "src/database",
        files: ["src/database/connection.ts"],
        exports: ["connect", "disconnect", "query"],
      },
      {
        name: "utils",
        path: "src/utils",
        files: ["src/utils/helpers.ts"],
        exports: ["formatDate", "hashPassword"],
      },
    ],
    edges,
    entryPoints: [],
  };
}

function makeSampleChange(overrides?: Partial<SymbolChange>): SymbolChange {
  return {
    name: "add-2fa-support",
    type: "added",
    module: "auth",
    summary: "Add two-factor authentication support to the auth module.",
    affectedApis: ["login", "validateSession"],
    affectedModules: ["auth", "security"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateModuleSpecs
// ---------------------------------------------------------------------------

describe("generateModuleSpecs", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the specs/modules directory", () => {
    generateModuleSpecs(makeTopologyWithOneModule(), tmpDir);

    expect(dirExists(path.join(tmpDir, "specs", "modules"))).toBe(true);
  });

  it("writes a spec file for each module", () => {
    const topology = makeTopologyWithMultipleModules();
    generateModuleSpecs(topology, tmpDir);

    for (const mod of topology.modules) {
      const specPath = path.join(tmpDir, "specs", "modules", `${mod.name}.md`);
      expect(fileExists(specPath)).toBe(true);
    }
  });

  it("generates module spec with correct heading", () => {
    const topology = makeTopologyWithOneModule();
    generateModuleSpecs(topology, tmpDir);

    const content = readFile(
      path.join(tmpDir, "specs", "modules", "auth.md"),
    );
    expect(content).toContain("# Module: auth");
  });

  it("includes auto-generated banner", () => {
    generateModuleSpecs(makeTopologyWithOneModule(), tmpDir);

    const content = readFile(
      path.join(tmpDir, "specs", "modules", "auth.md"),
    );
    expect(content).toContain("> Auto-generated by sdd-exoskeleton");
  });

  it("includes Overview section with path and file count", () => {
    generateModuleSpecs(makeTopologyWithOneModule(), tmpDir);

    const content = readFile(
      path.join(tmpDir, "specs", "modules", "auth.md"),
    );
    expect(content).toContain("## Overview");
    expect(content).toContain("src/auth — 3 files");
  });

  it("includes Classes section with table", () => {
    generateModuleSpecs(makeTopologyWithOneModule(), tmpDir);

    const content = readFile(
      path.join(tmpDir, "specs", "modules", "auth.md"),
    );
    expect(content).toContain("## Classes");
    expect(content).toContain("| Class | Description |");
    expect(content).toContain("|-------|-------------|");
  });

  it("shows placeholder when no classes are detected", () => {
    generateModuleSpecs(makeTopologyWithOneModule(), tmpDir);

    const content = readFile(
      path.join(tmpDir, "specs", "modules", "auth.md"),
    );
    expect(content).toContain("| _No classes detected_ | |");
  });

  it("includes API section with table", () => {
    generateModuleSpecs(makeTopologyWithOneModule(), tmpDir);

    const content = readFile(
      path.join(tmpDir, "specs", "modules", "auth.md"),
    );
    expect(content).toContain("## API");
    expect(content).toContain("| Method/Function | Signature | Description |");
    expect(content).toContain("|-----------------|-----------|-------------|");
  });

  it("lists exports in the API table", () => {
    generateModuleSpecs(makeTopologyWithOneModule(), tmpDir);

    const content = readFile(
      path.join(tmpDir, "specs", "modules", "auth.md"),
    );
    expect(content).toContain("| login | | |");
    expect(content).toContain("| logout | | |");
    expect(content).toContain("| validateSession | | |");
  });

  it("shows placeholder when module has no exports", () => {
    const mod: ModuleInfo = {
      name: "empty",
      path: "src/empty",
      files: ["src/empty/index.ts"],
      exports: [],
    };
    const topology: ModuleTopology = {
      modules: [mod],
      edges: [],
      entryPoints: [],
    };

    generateModuleSpecs(topology, tmpDir);

    const content = readFile(
      path.join(tmpDir, "specs", "modules", "empty.md"),
    );
    expect(content).toContain("| _No exports detected_ | | |");
  });

  it("includes Dependencies section", () => {
    generateModuleSpecs(makeTopologyWithOneModule(), tmpDir);

    const content = readFile(
      path.join(tmpDir, "specs", "modules", "auth.md"),
    );
    expect(content).toContain("## Dependencies");
  });

  it("shows wikilinks for dependencies from edges", () => {
    const topology = makeTopologyWithDependencies();
    generateModuleSpecs(topology, tmpDir);

    const authContent = readFile(
      path.join(tmpDir, "specs", "modules", "auth.md"),
    );
    // auth → database, auth → utils
    expect(authContent).toContain("- [[database]]");
    expect(authContent).toContain("- [[utils]]");
  });

  it("shows multiple dependencies deduplicated and sorted", () => {
    const edges: DepEdge[] = [
      { source: "core", target: "z-utils", type: "import" },
      { source: "core", target: "a-helpers", type: "import" },
      { source: "core", target: "a-helpers", type: "call" }, // duplicate target
    ];
    const topology: ModuleTopology = {
      modules: [
        {
          name: "core",
          path: "src/core",
          files: ["src/core/index.ts"],
          exports: [],
        },
      ],
      edges,
      entryPoints: [],
    };

    generateModuleSpecs(topology, tmpDir);

    const content = readFile(
      path.join(tmpDir, "specs", "modules", "core.md"),
    );

    // Should be sorted alphabetically and deduplicated
    const depSection = content.split("## Dependencies")[1];
    const aIndex = depSection.indexOf("[[a-helpers]]");
    const zIndex = depSection.indexOf("[[z-utils]]");
    expect(aIndex).toBeGreaterThan(-1);
    expect(zIndex).toBeGreaterThan(-1);
    expect(aIndex).toBeLessThan(zIndex);

    // Should only appear once (no duplicate)
    const aHelpersCount = (
      depSection.match(/\[\[a-helpers\]\]/g) ?? []
    ).length;
    expect(aHelpersCount).toBe(1);
  });

  it("shows placeholder when module has no dependencies", () => {
    generateModuleSpecs(makeTopologyWithOneModule(), tmpDir);

    const content = readFile(
      path.join(tmpDir, "specs", "modules", "auth.md"),
    );
    expect(content).toContain("_No dependencies detected._");
  });

  it("handles empty modules array gracefully", () => {
    expect(() =>
      generateModuleSpecs(makeEmptyTopology(), tmpDir),
    ).not.toThrow();

    // Directory should still be created
    expect(dirExists(path.join(tmpDir, "specs", "modules"))).toBe(true);
  });

  it("handles modules with empty files array", () => {
    const mod: ModuleInfo = {
      name: "no-files",
      path: "src/no-files",
      files: [],
      exports: ["placeholder"],
    };
    const topology: ModuleTopology = {
      modules: [mod],
      edges: [],
      entryPoints: [],
    };

    generateModuleSpecs(topology, tmpDir);

    const content = readFile(
      path.join(tmpDir, "specs", "modules", "no-files.md"),
    );
    expect(content).toContain("src/no-files — 0 files");
    expect(content).toContain("| placeholder | | |");
  });

  it("does not mutate the input topology", () => {
    const topology = makeTopologyWithMultipleModules();
    const moduleCountBefore = topology.modules.length;
    const firstModuleExportsBefore = topology.modules[0].exports.length;

    generateModuleSpecs(topology, tmpDir);

    expect(topology.modules.length).toBe(moduleCountBefore);
    expect(topology.modules[0].exports.length).toBe(firstModuleExportsBefore);
  });

  it("overwrites existing spec files", () => {
    const topology = makeTopologyWithOneModule();
    generateModuleSpecs(topology, tmpDir);

    // Modify the module and regenerate
    const updatedMod: ModuleInfo = {
      name: "auth",
      path: "src/auth",
      files: ["src/auth/login.ts"],
      exports: ["login"],
    };
    const updatedTopology: ModuleTopology = {
      modules: [updatedMod],
      edges: [],
      entryPoints: [],
    };
    generateModuleSpecs(updatedTopology, tmpDir);

    const content = readFile(
      path.join(tmpDir, "specs", "modules", "auth.md"),
    );
    expect(content).toContain("src/auth — 1 files");
    // Old exports should be gone
    expect(content).not.toContain("| logout | | |");
    expect(content).toContain("| login | | |");
  });

  it("escapes pipe characters in export names", () => {
    const mod: ModuleInfo = {
      name: "parser",
      path: "src/parser",
      files: ["src/parser/index.ts"],
      exports: ["parse|typeA", "parse|typeB"],
    };
    const topology: ModuleTopology = {
      modules: [mod],
      edges: [],
      entryPoints: [],
    };

    generateModuleSpecs(topology, tmpDir);

    const content = readFile(
      path.join(tmpDir, "specs", "modules", "parser.md"),
    );
    // Should escape the pipe character
    expect(content).toContain("| parse\\|typeA | | |");
    expect(content).toContain("| parse\\|typeB | | |");
  });
});

// ---------------------------------------------------------------------------
// generateSchemas
// ---------------------------------------------------------------------------

describe("generateSchemas", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the specs/schemas directory", () => {
    generateSchemas(tmpDir);

    expect(dirExists(path.join(tmpDir, "schemas"))).toBe(true);
  });

  it("creates a placeholder schema file", () => {
    generateSchemas(tmpDir);

    expect(
      fileExists(path.join(tmpDir, "schemas", "placeholder.schema.md")),
    ).toBe(true);
  });

  it("creates a README.md in the schemas directory", () => {
    generateSchemas(tmpDir);

    expect(fileExists(path.join(tmpDir, "schemas", "README.md"))).toBe(
      true,
    );
  });

  it("placeholder schema contains expected sections", () => {
    generateSchemas(tmpDir);

    const content = readFile(
      path.join(tmpDir, "schemas", "placeholder.schema.md"),
    );
    expect(content).toContain("# Schema: placeholder");
    expect(content).toContain("> Auto-generated by sdd-exoskeleton");
    expect(content).toContain("## Table: placeholder");
    expect(content).toContain("| Column | Type | Nullable | Description |");
    expect(content).toContain("| id | TEXT | NO | Primary key |");
    expect(content).toContain("| created_at | TIMESTAMP | NO | Creation timestamp |");
    expect(content).toContain("## Relations");
    expect(content).toContain("_No relations extracted yet._");
  });

  it("README describes the schemas directory", () => {
    generateSchemas(tmpDir);

    const content = readFile(
      path.join(tmpDir, "schemas", "README.md"),
    );
    expect(content).toContain("# Schemas");
    expect(content).toContain("> Auto-generated by sdd-exoskeleton");
    expect(content).toContain("database schema specifications");
    expect(content).toContain("placeholder");
  });

  it("is idempotent — running twice does not throw", () => {
    generateSchemas(tmpDir);
    expect(() => generateSchemas(tmpDir)).not.toThrow();

    // Files should still exist
    expect(
      fileExists(path.join(tmpDir, "schemas", "placeholder.schema.md")),
    ).toBe(true);
    expect(
      fileExists(path.join(tmpDir, "schemas", "README.md")),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateChangeProposal
// ---------------------------------------------------------------------------

describe("generateChangeProposal", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the proposal.md file", () => {
    generateChangeProposal(makeSampleChange(), tmpDir);

    expect(fileExists(path.join(tmpDir, "proposal.md"))).toBe(true);
  });

  it("writes a proposal.md file", () => {
    const change = makeSampleChange();
    generateChangeProposal(change, tmpDir);

    expect(
      fileExists(path.join(tmpDir, "proposal.md")),
    ).toBe(true);
  });

  it("generates correct heading with change name", () => {
    generateChangeProposal(makeSampleChange(), tmpDir);

    const content = readFile(
      path.join(tmpDir, "proposal.md"),
    );
    expect(content).toContain("# Change: add-2fa-support");
  });

  it("includes auto-generated banner", () => {
    generateChangeProposal(makeSampleChange(), tmpDir);

    const content = readFile(
      path.join(tmpDir, "proposal.md"),
    );
    expect(content).toContain("> Auto-generated by sdd-exoskeleton");
  });

  it("renders change type and module metadata after banner", () => {
    const change = makeSampleChange();
    generateChangeProposal(change, tmpDir);

    const content = readFile(path.join(tmpDir, "proposal.md"));
    expect(content).toContain("**Type:** added");
    expect(content).toContain("**Module:** auth");
  });

  it("includes Summary section with the change summary", () => {
    const change = makeSampleChange();
    generateChangeProposal(change, tmpDir);

    const content = readFile(
      path.join(tmpDir, "proposal.md"),
    );
    expect(content).toContain("## Summary");
    expect(content).toContain(change.summary);
  });

  it("lists affected modules", () => {
    const change = makeSampleChange();
    generateChangeProposal(change, tmpDir);

    const content = readFile(
      path.join(tmpDir, "proposal.md"),
    );
    expect(content).toContain("## Affected Modules");
    expect(content).toContain("- auth");
    expect(content).toContain("- security");
  });

  it("shows placeholder when no affected modules", () => {
    const change = makeSampleChange({ affectedModules: [] });
    generateChangeProposal(change, tmpDir);

    const content = readFile(
      path.join(tmpDir, "proposal.md"),
    );
    expect(content).toContain("_No affected modules specified._");
  });

  it("lists affected APIs", () => {
    const change = makeSampleChange();
    generateChangeProposal(change, tmpDir);

    const content = readFile(
      path.join(tmpDir, "proposal.md"),
    );
    expect(content).toContain("## Affected APIs");
    expect(content).toContain("- login");
    expect(content).toContain("- validateSession");
  });

  it("shows placeholder when no affected APIs", () => {
    const change = makeSampleChange({ affectedApis: [] });
    generateChangeProposal(change, tmpDir);

    const content = readFile(
      path.join(tmpDir, "proposal.md"),
    );
    expect(content).toContain("_No affected APIs specified._");
  });

  it("includes default task checklist", () => {
    generateChangeProposal(makeSampleChange(), tmpDir);

    const content = readFile(
      path.join(tmpDir, "proposal.md"),
    );
    expect(content).toContain("## Tasks");
    expect(content).toContain("- [ ] Review impact");
    expect(content).toContain("- [ ] Update specs");
    expect(content).toContain("- [ ] Update tests");
  });

  it("handles a 'modified' change type", () => {
    const change = makeSampleChange({ type: "modified" });
    generateChangeProposal(change, tmpDir);

    const content = readFile(
      path.join(tmpDir, "proposal.md"),
    );
    expect(content).toContain("# Change: add-2fa-support");
    expect(content).toContain("## Summary");
  });

  it("handles a 'removed' change type", () => {
    const change = makeSampleChange({
      name: "remove-legacy-api",
      type: "removed",
      summary: "Remove the deprecated v1 API endpoints.",
    });
    generateChangeProposal(change, tmpDir);

    const content = readFile(
      path.join(tmpDir, "proposal.md"),
    );
    expect(content).toContain("# Change: remove-legacy-api");
    expect(content).toContain("Remove the deprecated v1 API endpoints.");
  });

  it("handles a 'renamed' change type", () => {
    const change = makeSampleChange({
      name: "rename-user-service",
      type: "renamed",
      summary: "Rename UserService to AccountService.",
    });
    generateChangeProposal(change, tmpDir);

    const content = readFile(
      path.join(tmpDir, "proposal.md"),
    );
    expect(content).toContain("# Change: rename-user-service");
  });

  it("overwrites an existing change proposal", () => {
    const change = makeSampleChange();
    generateChangeProposal(change, tmpDir);

    const updatedChange = makeSampleChange({
      summary: "Updated summary for 2FA support.",
    });
    generateChangeProposal(updatedChange, tmpDir);

    const content = readFile(
      path.join(tmpDir, "proposal.md"),
    );
    expect(content).toContain("Updated summary for 2FA support.");
    expect(content).not.toContain("Add two-factor authentication support");
  });

  it("does not mutate the input change object", () => {
    const change = makeSampleChange();
    const originalName = change.name;
    const originalAffectedModulesLength = change.affectedModules.length;

    generateChangeProposal(change, tmpDir);

    expect(change.name).toBe(originalName);
    expect(change.affectedModules.length).toBe(originalAffectedModulesLength);
  });
});

// ---------------------------------------------------------------------------
// Integration: full spec generation workflow
// ---------------------------------------------------------------------------

describe("full spec generation workflow", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates module specs, schemas, and proposal together", () => {
    // Act
    generateModuleSpecs(makeTopologyWithMultipleModules(), tmpDir);
    generateSchemas(tmpDir);
    generateChangeProposal(
      makeSampleChange({
        name: "refactor-db-layer",
        type: "modified",
        module: "database",
        summary: "Refactor the database layer to use connection pooling.",
        affectedApis: ["connect", "disconnect", "query"],
        affectedModules: ["database"],
      }),
      tmpDir,
    );

    // Assert: all files are created at the expected paths
    const allFiles = listFilesRecursive(tmpDir);
    const relativeFiles = allFiles.map((f) => path.relative(tmpDir, f)).sort();

    expect(relativeFiles).toContain("specs/modules/auth.md");
    expect(relativeFiles).toContain("specs/modules/user-service.md");
    expect(relativeFiles).toContain("specs/modules/database.md");
    expect(relativeFiles).toContain("schemas/placeholder.schema.md");
    expect(relativeFiles).toContain("schemas/README.md");
    expect(relativeFiles).toContain("proposal.md");

    // proposal.md content should match the last change proposal written
    const proposalContent = readFile(path.join(tmpDir, "proposal.md"));
    expect(proposalContent).toContain("# Change: refactor-db-layer");
    expect(proposalContent).toContain("Refactor the database layer to use connection pooling.");
  });

  it("generated module specs are valid markdown with expected structure", () => {
    generateModuleSpecs(makeTopologyWithMultipleModules(), tmpDir);

    const content = readFile(
      path.join(tmpDir, "specs", "modules", "auth.md"),
    );

    // All expected sections present
    expect(content).toContain("# Module:");
    expect(content).toContain("## Overview");
    expect(content).toContain("## Classes");
    expect(content).toContain("## API");
    expect(content).toContain("## Dependencies");

    // Auto-gen banner
    expect(content).toContain("> Auto-generated by sdd-exoskeleton");
  });

  it("dependency wikilinks reference other generated modules", () => {
    const topology = makeTopologyWithDependencies();
    generateModuleSpecs(topology, tmpDir);

    // auth depends on database and utils
    const authContent = readFile(
      path.join(tmpDir, "specs", "modules", "auth.md"),
    );
    expect(authContent).toContain("- [[database]]");
    expect(authContent).toContain("- [[utils]]");
  });
});
