import { describe, it, expect } from "vitest";
import {
  identifyBoundaries,
  identifyCoreApis,
  identifyEntryPoints,
  assessHealth,
  analyzeModules,
  ModuleTopology,
  Boundary,
  HealthReport,
} from "../../src/analyzers/structure.js";
import type { ModuleInfo, DepEdge } from "../../src/integrations/codegraph.js";
import type { ApiInfo } from "../../src/integrations/obsidian.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModule(
  name: string,
  path: string,
  files: string[] = [path],
  exports: string[] = [],
): ModuleInfo {
  return { name, path, files, exports };
}

function makeEdge(
  source: string,
  target: string,
  type: DepEdge["type"] = "import",
): DepEdge {
  return { source, target, type };
}

// ---------------------------------------------------------------------------
// identifyBoundaries
// ---------------------------------------------------------------------------

describe("identifyBoundaries", () => {
  it("groups modules under the same top-level src directory into one boundary", () => {
    const modules: ModuleInfo[] = [
      makeModule("login", "src/auth/login.ts"),
      makeModule("middleware", "src/auth/middleware.ts"),
      makeModule("session", "src/auth/session.ts"),
    ];

    const boundaries = identifyBoundaries(modules);

    expect(boundaries).toHaveLength(1);
    expect(boundaries[0].name).toBe("auth");
    expect(boundaries[0].modules).toEqual(
      expect.arrayContaining(["login", "middleware", "session"]),
    );
  });

  it("creates separate boundaries for different top-level directories", () => {
    const modules: ModuleInfo[] = [
      makeModule("login", "src/auth/login.ts"),
      makeModule("query", "src/db/query.ts"),
      makeModule("format", "src/utils/format.ts"),
    ];

    const boundaries = identifyBoundaries(modules);

    expect(boundaries).toHaveLength(3);
    const names = boundaries.map((b) => b.name);
    expect(names).toEqual(["auth", "db", "utils"]);
  });

  it("returns boundaries sorted alphabetically by name", () => {
    const modules: ModuleInfo[] = [
      makeModule("zulu", "src/zulu/index.ts"),
      makeModule("alpha", "src/alpha/index.ts"),
      makeModule("mike", "src/mike/index.ts"),
    ];

    const boundaries = identifyBoundaries(modules);

    expect(boundaries.map((b) => b.name)).toEqual(["alpha", "mike", "zulu"]);
  });

  it('assigns a single file at source-directory root to boundary "root"', () => {
    const modules: ModuleInfo[] = [
      makeModule("config", "src/config.ts"),
    ];

    const boundaries = identifyBoundaries(modules);

    expect(boundaries).toHaveLength(1);
    expect(boundaries[0].name).toBe("root");
    expect(boundaries[0].modules).toEqual(["config"]);
  });

  it('assigns a file at project root to boundary "root"', () => {
    const modules: ModuleInfo[] = [
      makeModule("main", "main.ts"),
    ];

    const boundaries = identifyBoundaries(modules);

    expect(boundaries).toHaveLength(1);
    expect(boundaries[0].name).toBe("root");
    expect(boundaries[0].modules).toEqual(["main"]);
  });

  it("handles directory modules (path without extension) correctly", () => {
    const modules: ModuleInfo[] = [
      {
        name: "auth",
        path: "src/auth",
        files: ["src/auth/login.ts", "src/auth/register.ts"],
        exports: [],
      },
      {
        name: "db",
        path: "src/db",
        files: ["src/db/query.ts"],
        exports: [],
      },
    ];

    const boundaries = identifyBoundaries(modules);

    expect(boundaries).toHaveLength(2);
    expect(boundaries[0].name).toBe("auth");
    expect(boundaries[0].modules).toEqual(["auth"]);
    expect(boundaries[1].name).toBe("db");
    expect(boundaries[1].modules).toEqual(["db"]);
  });

  it("uses the first path component as boundary when not under a src dir", () => {
    const modules: ModuleInfo[] = [
      makeModule("helper", "components/helper.ts"),
      makeModule("button", "components/button.ts"),
    ];

    const boundaries = identifyBoundaries(modules);

    expect(boundaries).toHaveLength(1);
    expect(boundaries[0].name).toBe("components");
  });

  it("returns an empty array for empty modules input", () => {
    expect(identifyBoundaries([])).toEqual([]);
  });

  it("handles modules under lib/ source directory", () => {
    const modules: ModuleInfo[] = [
      makeModule("parser", "lib/parser/tokenize.ts"),
      makeModule("ast", "lib/parser/ast.ts"),
    ];

    const boundaries = identifyBoundaries(modules);

    expect(boundaries).toHaveLength(1);
    expect(boundaries[0].name).toBe("parser");
  });

  it("handles modules under app/ source directory", () => {
    const modules: ModuleInfo[] = [
      makeModule("controller", "app/controllers/home.ts"),
      makeModule("model", "app/models/user.ts"),
    ];

    const boundaries = identifyBoundaries(modules);

    expect(boundaries.map((b) => b.name)).toEqual(["controllers", "models"]);
  });

  it("deduplicates boundary names", () => {
    const modules: ModuleInfo[] = [
      makeModule("a", "src/utils/a.ts"),
      makeModule("b", "src/utils/b.ts"),
      makeModule("c", "src/utils/c.ts"),
    ];

    const boundaries = identifyBoundaries(modules);

    expect(boundaries).toHaveLength(1);
    expect(boundaries[0].name).toBe("utils");
  });

  it("does not mutate the input modules array", () => {
    const modules: ModuleInfo[] = [
      makeModule("x", "src/auth/x.ts"),
    ];
    const frozen = structuredClone(modules);

    identifyBoundaries(modules);

    expect(modules).toEqual(frozen);
  });
});

// ---------------------------------------------------------------------------
// identifyCoreApis
// ---------------------------------------------------------------------------

describe("identifyCoreApis", () => {
  it("returns API info for edges that cross boundaries", () => {
    const modules: ModuleInfo[] = [
      makeModule("login", "src/auth/login.ts"),
      makeModule("query", "src/db/query.ts"),
    ];

    const edges: DepEdge[] = [makeEdge("login", "query")];

    const topology: ModuleTopology = {
      modules,
      edges,
      entryPoints: [],
    };

    const apis = identifyCoreApis(topology);

    expect(apis).toHaveLength(1);
    expect(apis[0]).toMatchObject({
      name: "query",
      route: "login → query",
      method: "export",
      module: "db",
    });
  });

  it("omits edges that stay within the same boundary", () => {
    const modules: ModuleInfo[] = [
      makeModule("login", "src/auth/login.ts"),
      makeModule("middleware", "src/auth/middleware.ts"),
    ];

    const edges: DepEdge[] = [makeEdge("login", "middleware")];

    const topology: ModuleTopology = {
      modules,
      edges,
      entryPoints: [],
    };

    const apis = identifyCoreApis(topology);

    expect(apis).toEqual([]);
  });

  it("returns an empty array when there are no edges", () => {
    const modules: ModuleInfo[] = [
      makeModule("login", "src/auth/login.ts"),
      makeModule("query", "src/db/query.ts"),
    ];

    const topology: ModuleTopology = {
      modules,
      edges: [],
      entryPoints: [],
    };

    expect(identifyCoreApis(topology)).toEqual([]);
  });

  it("returns an empty array when there are no modules", () => {
    const topology: ModuleTopology = {
      modules: [],
      edges: [makeEdge("a", "b")],
      entryPoints: [],
    };

    expect(identifyCoreApis(topology)).toEqual([]);
  });

  it("assigns the target's boundary name as the ApiInfo module", () => {
    const modules: ModuleInfo[] = [
      makeModule("homeCtrl", "src/controllers/home.ts"),
      makeModule("userModel", "src/models/user.ts"),
      makeModule("formatUtil", "src/utils/format.ts"),
    ];

    const edges: DepEdge[] = [
      makeEdge("homeCtrl", "userModel"),
      makeEdge("homeCtrl", "formatUtil"),
    ];

    const topology: ModuleTopology = {
      modules,
      edges,
      entryPoints: [],
    };

    const apis = identifyCoreApis(topology);

    expect(apis).toHaveLength(2);
    expect(apis[0].module).toBe("models");
    expect(apis[1].module).toBe("utils");
  });

  it("handles edges where source or target module is not found in boundaries", () => {
    const modules: ModuleInfo[] = [
      makeModule("login", "src/auth/login.ts"),
    ];

    const edges: DepEdge[] = [
      makeEdge("login", "nonexistent"),
      makeEdge("unknown", "login"),
    ];

    const topology: ModuleTopology = {
      modules,
      edges,
      entryPoints: [],
    };

    const apis = identifyCoreApis(topology);

    // Neither edge should produce an API entry because source or target is
    // missing from the boundary map.
    expect(apis).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// identifyEntryPoints
// ---------------------------------------------------------------------------

describe("identifyEntryPoints", () => {
  it("detects index.* files at the top of source trees", () => {
    const modules: ModuleInfo[] = [
      makeModule("index", "src/index.ts", ["src/index.ts"]),
    ];

    const entryPoints = identifyEntryPoints(modules);
    expect(entryPoints).toEqual(["src/index.ts"]);
  });

  it("detects main.* files", () => {
    const modules: ModuleInfo[] = [
      makeModule("main", "src/main.ts", ["src/main.ts"]),
    ];

    expect(identifyEntryPoints(modules)).toEqual(["src/main.ts"]);
  });

  it("detects app.* files", () => {
    const modules: ModuleInfo[] = [
      makeModule("app", "src/app.ts", ["src/app.ts"]),
    ];

    expect(identifyEntryPoints(modules)).toEqual(["src/app.ts"]);
  });

  it("detects server.* files", () => {
    const modules: ModuleInfo[] = [
      makeModule("server", "src/server.ts", ["src/server.ts"]),
    ];

    expect(identifyEntryPoints(modules)).toEqual(["src/server.ts"]);
  });

  it("detects cli.* files", () => {
    const modules: ModuleInfo[] = [
      makeModule("cli", "src/cli.ts", ["src/cli.ts"]),
    ];

    expect(identifyEntryPoints(modules)).toEqual(["src/cli.ts"]);
  });

  it("detects bin.* files", () => {
    const modules: ModuleInfo[] = [
      makeModule("bin", "bin.ts", ["bin.ts"]),
    ];

    expect(identifyEntryPoints(modules)).toEqual(["bin.ts"]);
  });

  it("detects entry points at depth 1 under a src dir", () => {
    const modules: ModuleInfo[] = [
      {
        name: "auth",
        path: "src/auth",
        files: ["src/auth/index.ts", "src/auth/login.ts"],
        exports: [],
      },
    ];

    const entryPoints = identifyEntryPoints(modules);
    expect(entryPoints).toEqual(["src/auth/index.ts"]);
  });

  it("excludes entry-point files that are too deep (>1 directory level under src)", () => {
    const modules: ModuleInfo[] = [
      {
        name: "deep",
        path: "src/a/b",
        files: ["src/a/b/c/index.ts"],
        exports: [],
      },
    ];

    const entryPoints = identifyEntryPoints(modules);
    expect(entryPoints).toEqual([]);
  });

  it("excludes files whose basename does not match entry patterns", () => {
    const modules: ModuleInfo[] = [
      makeModule("helper", "src/helper.ts", ["src/helper.ts"]),
      makeModule("config", "src/config.ts", ["src/config.ts"]),
    ];

    expect(identifyEntryPoints(modules)).toEqual([]);
  });

  it("detects multiple entry points across modules", () => {
    const modules: ModuleInfo[] = [
      makeModule("main", "src/main.ts", ["src/main.ts"]),
      {
        name: "auth",
        path: "src/auth",
        files: ["src/auth/index.ts"],
        exports: [],
      },
      makeModule("server", "src/server.ts", ["src/server.ts"]),
    ];

    const entryPoints = identifyEntryPoints(modules);

    expect(entryPoints).toEqual(
      expect.arrayContaining(["src/main.ts", "src/auth/index.ts", "src/server.ts"]),
    );
    expect(entryPoints).toHaveLength(3);
  });

  it("returns an empty array for empty modules", () => {
    expect(identifyEntryPoints([])).toEqual([]);
  });

  it("detects entry points at the project root (no src dir)", () => {
    const modules: ModuleInfo[] = [
      makeModule("index", "index.ts", ["index.ts"]),
    ];

    expect(identifyEntryPoints(modules)).toEqual(["index.ts"]);
  });

  it("does not mutate the input modules", () => {
    const modules: ModuleInfo[] = [
      makeModule("index", "src/index.ts", ["src/index.ts"]),
    ];
    const frozen = structuredClone(modules);

    identifyEntryPoints(modules);

    expect(modules).toEqual(frozen);
  });
});

// ---------------------------------------------------------------------------
// assessHealth
// ---------------------------------------------------------------------------

describe("assessHealth", () => {
  it("returns a perfect score of 100 with no issues for a healthy topology", () => {
    const modules: ModuleInfo[] = [
      makeModule("a", "src/a/index.ts", ["src/a/index.ts"], ["doA"]),
      makeModule("b", "src/b/index.ts", ["src/b/index.ts"], ["doB"]),
    ];

    const edges: DepEdge[] = [makeEdge("a", "b")];

    const topology: ModuleTopology = { modules, edges, entryPoints: [] };

    const report = assessHealth(topology);

    expect(report.score).toBe(100);
    expect(report.issues).toEqual([]);
  });

  it("detects circular dependencies and deducts 20 per cycle", () => {
    const modules: ModuleInfo[] = [
      makeModule("a", "src/a/index.ts"),
      makeModule("b", "src/b/index.ts"),
    ];

    // a → b → a (cycle)
    const edges: DepEdge[] = [
      makeEdge("a", "b"),
      makeEdge("b", "a"),
    ];

    const topology: ModuleTopology = { modules, edges, entryPoints: [] };

    const report = assessHealth(topology);

    expect(report.score).toBe(80);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toContain("circular dependency");
  });

  it("describes the circular dependency path", () => {
    const modules: ModuleInfo[] = [
      makeModule("a", "src/a/index.ts"),
      makeModule("b", "src/b/index.ts"),
      makeModule("c", "src/c/index.ts"),
    ];

    // a → b → c → a
    const edges: DepEdge[] = [
      makeEdge("a", "b"),
      makeEdge("b", "c"),
      makeEdge("c", "a"),
    ];

    const topology: ModuleTopology = { modules, edges, entryPoints: [] };

    const report = assessHealth(topology);

    expect(report.score).toBe(80);
    expect(report.issues[0]).toBe("circular dependency: a → b → c → a");
  });

  it("detects multiple independent cycles", () => {
    const modules: ModuleInfo[] = [
      makeModule("a", "src/a/index.ts"),
      makeModule("b", "src/b/index.ts"),
      makeModule("c", "src/c/index.ts"),
      makeModule("d", "src/d/index.ts"),
    ];

    // a ↔ b and c → d → c
    const edges: DepEdge[] = [
      makeEdge("a", "b"),
      makeEdge("b", "a"),
      makeEdge("c", "d"),
      makeEdge("d", "c"),
    ];

    const topology: ModuleTopology = { modules, edges, entryPoints: [] };

    const report = assessHealth(topology);

    expect(report.score).toBe(60); // 100 - 20 - 20
    expect(report.issues.filter((i) => i.includes("circular dependency"))).toHaveLength(2);
  });

  it("deducts 15 per god module (>50 exports)", () => {
    const manyExports = Array.from({ length: 51 }, (_, i) => `export${i}`);

    const modules: ModuleInfo[] = [
      makeModule("god", "src/god/index.ts", ["src/god/index.ts"], manyExports),
      makeModule("normal", "src/normal/index.ts", ["src/normal/index.ts"], ["one"]),
    ];

    // Self-referencing edges keep modules from being flagged as orphans.
    const edges: DepEdge[] = [makeEdge("god", "god"), makeEdge("normal", "normal")];

    const topology: ModuleTopology = { modules, edges, entryPoints: [] };

    const report = assessHealth(topology);

    expect(report.score).toBe(85);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toContain("god module");
    expect(report.issues[0]).toContain("god");
  });

  it("does not penalise modules with exactly 50 exports", () => {
    const exactly50 = Array.from({ length: 50 }, (_, i) => `export${i}`);

    const modules: ModuleInfo[] = [
      makeModule("big", "src/big/index.ts", ["src/big/index.ts"], exactly50),
    ];

    const edges: DepEdge[] = [makeEdge("big", "big")];

    const topology: ModuleTopology = { modules, edges, entryPoints: [] };

    const report = assessHealth(topology);

    expect(report.score).toBe(100);
    expect(report.issues).toHaveLength(0);
  });

  it("deducts 10 per orphan module (no incoming or outgoing deps)", () => {
    const modules: ModuleInfo[] = [
      makeModule("orphan", "src/orphan/index.ts"),
      makeModule("connected", "src/connected/index.ts"),
    ];

    const edges: DepEdge[] = [makeEdge("connected", "connected")]; // self-loop makes "connected" referenced

    const topology: ModuleTopology = { modules, edges, entryPoints: [] };

    const report = assessHealth(topology);

    expect(report.score).toBe(90);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toContain("orphan module");
    expect(report.issues[0]).toContain("orphan");
  });

  it("deducts 5 per deep-nested file (>4 levels under src)", () => {
    const modules: ModuleInfo[] = [
      makeModule("deep", "src/deep/index.ts", [
        "src/a/b/c/d/e/deep.ts", // 5 levels under src → depth 5 > 4
      ]),
    ];

    const edges: DepEdge[] = [makeEdge("deep", "deep")];

    const topology: ModuleTopology = { modules, edges, entryPoints: [] };

    const report = assessHealth(topology);

    expect(report.score).toBe(95);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toContain("deep-nested file");
  });

  it("does not penalise files at exactly 4 levels deep", () => {
    const modules: ModuleInfo[] = [
      makeModule("ok", "src/ok/index.ts", [
        "src/a/b/c/d/file.ts", // 4 levels under src → depth 4 → not penalised
      ]),
    ];

    const edges: DepEdge[] = [makeEdge("ok", "ok")];

    const topology: ModuleTopology = { modules, edges, entryPoints: [] };

    const report = assessHealth(topology);

    expect(report.score).toBe(100);
  });

  it("clamps the score to 0 for very unhealthy topologies", () => {
    const manyExports = Array.from({ length: 51 }, (_, i) => `e${i}`);

    const modules: ModuleInfo[] = [
      makeModule("a", "src/a/index.ts", ["src/a/index.ts"], manyExports),
      makeModule("b", "src/b/index.ts", ["src/b/index.ts"], manyExports),
      makeModule("c", "src/c/index.ts", ["src/c/index.ts"], manyExports),
      makeModule("d", "src/d/index.ts", ["src/d/index.ts"], manyExports),
      makeModule("e", "src/e/index.ts", ["src/e/index.ts"], manyExports),
      makeModule("f", "src/f/index.ts", ["src/f/index.ts"], manyExports),
      makeModule("g", "src/g/index.ts", ["src/g/index.ts"], manyExports),
    ];

    // Create circular deps
    const edges: DepEdge[] = [
      makeEdge("a", "b"),
      makeEdge("b", "a"),
      makeEdge("c", "d"),
      makeEdge("d", "c"),
    ];

    const topology: ModuleTopology = { modules, edges, entryPoints: [] };

    const report = assessHealth(topology);

    // 100 - 2*20 (cycles) - 7*15 (god modules) = 100 - 40 - 105 = -45 → clamped to 0
    expect(report.score).toBe(0);
    expect(report.issues.length).toBeGreaterThan(0);
  });

  it("returns an empty issues list and score 100 for an empty topology", () => {
    const topology: ModuleTopology = { modules: [], edges: [], entryPoints: [] };

    const report = assessHealth(topology);

    expect(report.score).toBe(100);
    expect(report.issues).toEqual([]);
  });

  it("deducts for multiple issue types simultaneously", () => {
    const manyExports = Array.from({ length: 51 }, (_, i) => `e${i}`);

    const modules: ModuleInfo[] = [
      // God module with circular dep involvement
      makeModule("a", "src/a/index.ts", ["src/a/index.ts"], manyExports),
      makeModule("b", "src/b/index.ts"),
      // Orphan (not referenced in any edge)
      makeModule("c", "src/c/index.ts"),
      // Module with deep-nested file
      makeModule("d", "src/d/index.ts", ["src/a/b/c/d/e/f.ts"]),
    ];

    // Circular: a → b → a.  Self-loops on b/d keep them from being
    // flagged as orphans while not creating cycles.
    const edges: DepEdge[] = [
      makeEdge("a", "b"),
      makeEdge("b", "a"),
      makeEdge("d", "d"),
    ];

    const topology: ModuleTopology = { modules, edges, entryPoints: [] };

    const report = assessHealth(topology);

    // 100 - 20 (1 cycle) - 15 (1 god module) - 10 (1 orphan: c) - 5 (1 deep file) = 50
    expect(report.score).toBe(50);
    expect(report.issues).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// analyzeModules
// ---------------------------------------------------------------------------

describe("analyzeModules", () => {
  it("builds a topology with modules, edges, and entry points", async () => {
    const modules: ModuleInfo[] = [
      makeModule("index", "src/index.ts", ["src/index.ts"]),
      makeModule("login", "src/auth/login.ts"),
    ];

    const topology = await analyzeModules("/fake/project", modules);

    expect(topology.modules).toHaveLength(2);
    // getDependencies is a stub returning [] until CodeGraph MCP is wired up
    expect(topology.edges).toEqual([]);
    expect(topology.entryPoints).toEqual(["src/index.ts"]);
  });

  it("detects entry points from the provided modules", async () => {
    const modules: ModuleInfo[] = [
      makeModule("server", "src/server.ts", ["src/server.ts"]),
    ];

    const topology = await analyzeModules("/fake/project", modules);

    expect(topology.entryPoints).toEqual(["src/server.ts"]);
  });

  it("does not mutate input modules", async () => {
    const modules: ModuleInfo[] = [
      makeModule("index", "src/index.ts", ["src/index.ts"]),
    ];
    const frozen = structuredClone(modules);

    await analyzeModules("/fake/project", modules);

    expect(modules).toEqual(frozen);
  });
});
