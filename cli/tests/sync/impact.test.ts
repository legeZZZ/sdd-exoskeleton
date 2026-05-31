import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  computeImpactLevel,
  mapToSpecs,
  analyzeImpact,
} from "../../src/sync/impact.js";
import type { SymbolChange } from "../../src/sync/detector.js";
import type { ImpactReport } from "../../src/sync/impact.js";
import { saveSyncState } from "../../src/sync-state.js";
import type { SyncState } from "../../src/sync-state.js";

function createSymbol(
  overrides: Partial<SymbolChange> = {},
): SymbolChange {
  return {
    name: "TestSymbol",
    type: "modified",
    module: "testModule",
    summary: "modified file src/testModule/test.ts",
    affectedApis: [],
    affectedModules: [],
    ...overrides,
  };
}

describe("computeImpactLevel", () => {
  it('returns "high" when symbol name starts with uppercase', () => {
    const symbol = createSymbol({ name: "UserService" });
    expect(computeImpactLevel(symbol)).toBe("high");
  });

  it('returns "high" when symbol has more than 3 affected modules', () => {
    const symbol = createSymbol({
      name: "helper",
      affectedModules: ["modA", "modB", "modC", "modD"],
    });
    expect(computeImpactLevel(symbol)).toBe("high");
  });

  it('returns "high" when symbol name starts with uppercase regardless of affected module count', () => {
    const symbol = createSymbol({
      name: "ApiController",
      affectedModules: [],
    });
    expect(computeImpactLevel(symbol)).toBe("high");
  });

  it('returns "medium" when symbol has 1-3 affected modules and lowercase name', () => {
    const symbol = createSymbol({
      name: "util",
      affectedModules: ["modA", "modB"],
    });
    expect(computeImpactLevel(symbol)).toBe("medium");
  });

  it('returns "medium" when symbol has exactly 1 affected module and lowercase name', () => {
    const symbol = createSymbol({
      name: "helper",
      affectedModules: ["modA"],
    });
    expect(computeImpactLevel(symbol)).toBe("medium");
  });

  it('returns "medium" when symbol has exactly 3 affected modules and lowercase name', () => {
    const symbol = createSymbol({
      name: "helper",
      affectedModules: ["modA", "modB", "modC"],
    });
    expect(computeImpactLevel(symbol)).toBe("medium");
  });

  it('returns "low" when symbol has no affected modules and lowercase name', () => {
    const symbol = createSymbol({
      name: "internalUtil",
      affectedModules: [],
    });
    expect(computeImpactLevel(symbol)).toBe("low");
  });

  it('returns "high" for single-character uppercase symbol name', () => {
    const symbol = createSymbol({ name: "A" });
    expect(computeImpactLevel(symbol)).toBe("high");
  });

  it('returns "low" for single-character lowercase symbol name with no affected modules', () => {
    const symbol = createSymbol({ name: "a", affectedModules: [] });
    expect(computeImpactLevel(symbol)).toBe("low");
  });
});

describe("mapToSpecs", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-impact-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns specs from sync-state.json mappedSpecs for the module", () => {
    const syncState: SyncState = {
      entries: {
        auth: {
          lastHash: "abc123",
          lastSyncedAt: new Date().toISOString(),
          mappedSpecs: ["authentication.md", "authorization.md"],
          mappedObsidianNodes: [],
        },
      },
    };
    saveSyncState(tmpDir, syncState);

    const symbol = createSymbol({ module: "auth" });
    const specs = mapToSpecs(symbol, tmpDir);

    expect(specs).toEqual(["authentication.md", "authorization.md"]);
  });

  it("returns specs from .md files that reference the module name", () => {
    const modulesDir = path.join(tmpDir, "openspec", "specs", "modules");
    fs.mkdirSync(modulesDir, { recursive: true });

    fs.writeFileSync(
      path.join(modulesDir, "login-spec.md"),
      "This spec covers the auth module and its interfaces.",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(modulesDir, "unrelated-spec.md"),
      "This spec covers the dashboard module.",
      "utf-8",
    );

    const symbol = createSymbol({ module: "auth" });
    const specs = mapToSpecs(symbol, tmpDir);

    expect(specs).toEqual(["login-spec.md"]);
  });

  it("combines sync-state and file-scanned specs, deduplicating and sorting", () => {
    const syncState: SyncState = {
      entries: {
        auth: {
          lastHash: "abc123",
          lastSyncedAt: new Date().toISOString(),
          mappedSpecs: ["auth-overview.md"],
          mappedObsidianNodes: [],
        },
      },
    };
    saveSyncState(tmpDir, syncState);

    const modulesDir = path.join(tmpDir, "openspec", "specs", "modules");
    fs.mkdirSync(modulesDir, { recursive: true });

    fs.writeFileSync(
      path.join(modulesDir, "auth-overview.md"),
      "Duplicated spec for auth module.",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(modulesDir, "login-flow.md"),
      "This covers auth module login flows.",
      "utf-8",
    );

    const symbol = createSymbol({ module: "auth" });
    const specs = mapToSpecs(symbol, tmpDir);

    expect(specs).toEqual(["auth-overview.md", "login-flow.md"]);
  });

  it("returns empty array when no specs reference the module", () => {
    const modulesDir = path.join(tmpDir, "openspec", "specs", "modules");
    fs.mkdirSync(modulesDir, { recursive: true });

    fs.writeFileSync(
      path.join(modulesDir, "dashboard-spec.md"),
      "This covers the dashboard module only.",
      "utf-8",
    );

    const symbol = createSymbol({ module: "unknown" });
    const specs = mapToSpecs(symbol, tmpDir);

    expect(specs).toEqual([]);
  });

  it("returns empty array when openspec/modules directory does not exist and no sync state", () => {
    const symbol = createSymbol({ module: "anything" });
    const specs = mapToSpecs(symbol, tmpDir);

    expect(specs).toEqual([]);
  });

  it("ignores non-.md files in the modules directory", () => {
    const modulesDir = path.join(tmpDir, "openspec", "specs", "modules");
    fs.mkdirSync(modulesDir, { recursive: true });

    fs.writeFileSync(
      path.join(modulesDir, "notes.txt"),
      "This file mentions auth but should be ignored.",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(modulesDir, "auth-spec.md"),
      "Auth module specification.",
      "utf-8",
    );

    const symbol = createSymbol({ module: "auth" });
    const specs = mapToSpecs(symbol, tmpDir);

    expect(specs).toEqual(["auth-spec.md"]);
  });

  it("handles empty module name gracefully", () => {
    const syncState: SyncState = {
      entries: {
        "": {
          lastHash: "abc",
          lastSyncedAt: new Date().toISOString(),
          mappedSpecs: ["root-spec.md"],
          mappedObsidianNodes: [],
        },
      },
    };
    saveSyncState(tmpDir, syncState);

    const symbol = createSymbol({ module: "" });
    const specs = mapToSpecs(symbol, tmpDir);

    expect(specs).toEqual(["root-spec.md"]);
  });
});

describe("analyzeImpact", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-impact-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns a low-impact report for empty changes", async () => {
    const report = await analyzeImpact([], tmpDir);

    expect(report.changes).toEqual([]);
    expect(report.affectedSpecs).toEqual([]);
    expect(report.affectedModules).toEqual([]);
    expect(report.impactLevel).toBe("low");
    expect(report.summary).toBe("No changes detected.");
  });

  it("returns low-impact report for a single lowercase symbol with no affected modules", async () => {
    const symbols: SymbolChange[] = [
      createSymbol({ name: "internalHelper", affectedModules: [] }),
    ];

    const report = await analyzeImpact(symbols, tmpDir);

    expect(report.impactLevel).toBe("low");
    expect(report.changes).toHaveLength(1);
    expect(report.affectedModules).toEqual(["testModule"]);
    expect(report.affectedSpecs).toEqual([]);
    expect(report.summary).toContain("Low impact");
  });

  it("returns medium-impact report for a symbol with affected modules", async () => {
    const symbols: SymbolChange[] = [
      createSymbol({
        name: "util",
        affectedModules: ["modA", "modB"],
      }),
    ];

    const report = await analyzeImpact(symbols, tmpDir);

    expect(report.impactLevel).toBe("medium");
    expect(report.summary).toContain("Medium impact");
  });

  it("returns high-impact report when any symbol starts with uppercase", async () => {
    const symbols: SymbolChange[] = [
      createSymbol({ name: "helper", affectedModules: [] }),
      createSymbol({ name: "UserService", affectedModules: [] }),
    ];

    const report = await analyzeImpact(symbols, tmpDir);

    expect(report.impactLevel).toBe("high");
    expect(report.summary).toContain("High impact");
  });

  it("aggregates affected modules with deduplication and sorting", async () => {
    const symbols: SymbolChange[] = [
      createSymbol({ module: "auth" }),
      createSymbol({ module: "utils" }),
      createSymbol({ module: "auth" }),
      createSymbol({ module: "dashboard" }),
    ];

    const report = await analyzeImpact(symbols, tmpDir);

    expect(report.affectedModules).toEqual(["auth", "dashboard", "utils"]);
  });

  it("aggregates affected specs with deduplication and sorting", async () => {
    const modulesDir = path.join(tmpDir, "openspec", "specs", "modules");
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.writeFileSync(
      path.join(modulesDir, "auth-spec.md"),
      "References auth module.",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(modulesDir, "dashboard-spec.md"),
      "References dashboard module.",
      "utf-8",
    );

    const symbols: SymbolChange[] = [
      createSymbol({ module: "auth" }),
      createSymbol({ module: "auth" }),
      createSymbol({ module: "dashboard" }),
    ];

    const report = await analyzeImpact(symbols, tmpDir);

    expect(report.affectedSpecs).toEqual([
      "auth-spec.md",
      "dashboard-spec.md",
    ]);
  });

  it("does not mutate the input symbols array", async () => {
    const symbols: SymbolChange[] = [
      createSymbol({ name: "Test", affectedModules: [] }),
    ];
    const original = structuredClone(symbols);

    await analyzeImpact(symbols, tmpDir);

    expect(symbols).toEqual(original);
  });

  it("includes correct summary with change, module, and spec counts", async () => {
    const modulesDir = path.join(tmpDir, "openspec", "specs", "modules");
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.writeFileSync(
      path.join(modulesDir, "auth-spec.md"),
      "References auth module.",
      "utf-8",
    );

    const symbols: SymbolChange[] = [
      createSymbol({ module: "auth" }),
      createSymbol({ module: "utils" }),
      createSymbol({ module: "auth" }),
    ];

    const report = await analyzeImpact(symbols, tmpDir);

    expect(report.summary).toContain("3 symbol change(s)");
    expect(report.summary).toContain("2 module(s)");
    expect(report.summary).toContain("1 spec(s)");
  });

  it("filters out empty module names from affected modules", async () => {
    const symbols: SymbolChange[] = [
      createSymbol({ module: "" }),
      createSymbol({ module: "auth" }),
      createSymbol({ module: "" }),
    ];

    const report = await analyzeImpact(symbols, tmpDir);

    expect(report.affectedModules).toEqual(["auth"]);
  });

  it("handles mixed impact levels correctly (medium + low = medium)", async () => {
    const symbols: SymbolChange[] = [
      createSymbol({ name: "internalHelper", affectedModules: [] }),
      createSymbol({ name: "util", affectedModules: ["modA"] }),
    ];

    const report = await analyzeImpact(symbols, tmpDir);

    expect(report.impactLevel).toBe("medium");
  });

  it("handles mixed impact levels correctly (low + low = low)", async () => {
    const symbols: SymbolChange[] = [
      createSymbol({ name: "helper", affectedModules: [] }),
      createSymbol({ name: "util", affectedModules: [] }),
    ];

    const report = await analyzeImpact(symbols, tmpDir);

    expect(report.impactLevel).toBe("low");
  });
});
