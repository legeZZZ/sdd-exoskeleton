import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadSyncState,
  saveSyncState,
  diffState,
  SyncState,
  SyncEntry,
} from "../src/sync-state.js";

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sdd-sync-state-test-"));
}

function makeEntry(overrides?: Partial<SyncEntry>): SyncEntry {
  return {
    lastHash: "abc123",
    lastSyncedAt: "2024-01-01T00:00:00Z",
    mappedSpecs: [],
    mappedObsidianNodes: [],
    ...overrides,
  };
}

describe("loadSyncState", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty state when no file exists", () => {
    const state = loadSyncState(tmpDir);
    expect(state).toEqual({ entries: {} });
  });

  it("loads a populated state correctly", () => {
    const expected: SyncState = {
      entries: {
        "src/foo.ts": {
          lastHash: "hash1",
          lastSyncedAt: "2024-01-01T00:00:00Z",
          mappedSpecs: ["spec1"],
          mappedObsidianNodes: ["node1"],
        },
        "src/bar.ts": {
          lastHash: "hash2",
          lastSyncedAt: "2024-01-02T00:00:00Z",
          mappedSpecs: ["spec2"],
          mappedObsidianNodes: [],
        },
      },
    };

    const dir = path.join(tmpDir, ".sdd-exoskeleton");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "sync-state.json"),
      JSON.stringify(expected, null, 2),
      "utf-8",
    );

    const loaded = loadSyncState(tmpDir);
    expect(loaded).toEqual(expected);
  });

  it("returns empty entries for JSON without entries field", () => {
    const dir = path.join(tmpDir, ".sdd-exoskeleton");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "sync-state.json"),
      JSON.stringify({ other: "stuff" }),
      "utf-8",
    );

    const loaded = loadSyncState(tmpDir);
    expect(loaded).toEqual({ entries: {} });
  });

  it("throws on invalid JSON", () => {
    const dir = path.join(tmpDir, ".sdd-exoskeleton");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "sync-state.json"),
      "broken json {{{",
      "utf-8",
    );

    expect(() => loadSyncState(tmpDir)).toThrow(/Invalid JSON/);
  });
});

describe("saveSyncState", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("round-trips through save and load", () => {
    const state: SyncState = {
      entries: {
        "src/a.ts": makeEntry({ lastHash: "hash-a" }),
        "src/b.ts": makeEntry({ lastHash: "hash-b" }),
      },
    };

    saveSyncState(tmpDir, state);
    const loaded = loadSyncState(tmpDir);
    expect(loaded).toEqual(state);
  });

  it("writes formatted JSON", () => {
    const state: SyncState = {
      entries: {
        "src/test.ts": makeEntry(),
      },
    };

    saveSyncState(tmpDir, state);

    const raw = fs.readFileSync(
      path.join(tmpDir, ".sdd-exoskeleton", "sync-state.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual(state);
    expect(raw).toContain("\n");
  });

  it("overwrites existing state file", () => {
    const state1: SyncState = {
      entries: { "file1.ts": makeEntry({ lastHash: "v1" }) },
    };
    const state2: SyncState = {
      entries: { "file2.ts": makeEntry({ lastHash: "v2" }) },
    };

    saveSyncState(tmpDir, state1);
    saveSyncState(tmpDir, state2);

    const loaded = loadSyncState(tmpDir);
    expect(loaded).toEqual(state2);
  });
});

describe("diffState", () => {
  it("returns empty arrays when states are identical", () => {
    const state: SyncState = {
      entries: {
        "a.ts": makeEntry({ lastHash: "h1" }),
        "b.ts": makeEntry({ lastHash: "h2" }),
      },
    };

    const result = diffState(state, state);
    expect(result).toEqual({ added: [], modified: [], removed: [] });
  });

  it("detects added entries", () => {
    const oldState: SyncState = {
      entries: { "a.ts": makeEntry({ lastHash: "h1" }) },
    };
    const newState: SyncState = {
      entries: {
        "a.ts": makeEntry({ lastHash: "h1" }),
        "b.ts": makeEntry({ lastHash: "h2" }),
      },
    };

    const result = diffState(oldState, newState);
    expect(result.added).toEqual(["b.ts"]);
    expect(result.modified).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it("detects modified entries (different hash)", () => {
    const oldState: SyncState = {
      entries: { "a.ts": makeEntry({ lastHash: "h1" }) },
    };
    const newState: SyncState = {
      entries: { "a.ts": makeEntry({ lastHash: "h1-changed" }) },
    };

    const result = diffState(oldState, newState);
    expect(result.modified).toEqual(["a.ts"]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it("does not detect modification when only mappedSpecs change (not hash)", () => {
    const oldState: SyncState = {
      entries: {
        "a.ts": makeEntry({
          lastHash: "h1",
          mappedSpecs: ["spec-a"],
        }),
      },
    };
    const newState: SyncState = {
      entries: {
        "a.ts": makeEntry({
          lastHash: "h1",
          mappedSpecs: ["spec-a", "spec-b"],
        }),
      },
    };

    const result = diffState(oldState, newState);
    // Hash is the same, so it's not modified
    expect(result.modified).toEqual([]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it("detects removed entries", () => {
    const oldState: SyncState = {
      entries: {
        "a.ts": makeEntry({ lastHash: "h1" }),
        "b.ts": makeEntry({ lastHash: "h2" }),
      },
    };
    const newState: SyncState = {
      entries: { "a.ts": makeEntry({ lastHash: "h1" }) },
    };

    const result = diffState(oldState, newState);
    expect(result.removed).toEqual(["b.ts"]);
    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([]);
  });

  it("handles empty states", () => {
    const empty: SyncState = { entries: {} };
    const populated: SyncState = {
      entries: { "x.ts": makeEntry({ lastHash: "hx" }) },
    };

    expect(diffState(empty, empty)).toEqual({
      added: [],
      modified: [],
      removed: [],
    });

    expect(diffState(empty, populated)).toEqual({
      added: ["x.ts"],
      modified: [],
      removed: [],
    });

    expect(diffState(populated, empty)).toEqual({
      added: [],
      modified: [],
      removed: ["x.ts"],
    });
  });

  it("handles mixed add/modify/remove in one diff", () => {
    const oldState: SyncState = {
      entries: {
        "keep.ts": makeEntry({ lastHash: "same" }),
        "modified.ts": makeEntry({ lastHash: "old" }),
        "removed.ts": makeEntry({ lastHash: "gone" }),
      },
    };
    const newState: SyncState = {
      entries: {
        "keep.ts": makeEntry({ lastHash: "same" }),
        "modified.ts": makeEntry({ lastHash: "new" }),
        "added.ts": makeEntry({ lastHash: "fresh" }),
      },
    };

    const result = diffState(oldState, newState);
    expect(result.added.sort()).toEqual(["added.ts"]);
    expect(result.modified.sort()).toEqual(["modified.ts"]);
    expect(result.removed.sort()).toEqual(["removed.ts"]);
  });

  it("returns sorted results for deterministic output", () => {
    const oldState: SyncState = {
      entries: {
        "z.ts": makeEntry({ lastHash: "hz" }),
        "a.ts": makeEntry({ lastHash: "ha" }),
      },
    };
    const newState: SyncState = {
      entries: {
        "c.ts": makeEntry({ lastHash: "hc" }),
        "z.ts": makeEntry({ lastHash: "hz-changed" }),
      },
    };

    const result = diffState(oldState, newState);
    expect(result.added).toEqual(["c.ts"].sort());
    expect(result.modified).toEqual(["z.ts"].sort());
    expect(result.removed).toEqual(["a.ts"].sort());
  });
});
