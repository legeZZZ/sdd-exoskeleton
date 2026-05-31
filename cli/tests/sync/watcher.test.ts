import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { startWatcher, stopWatcher } from "../../src/sync/watcher.js";
import type { Watcher } from "../../src/sync/watcher.js";

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sdd-watcher-test-"));
}

function ensureSrcDir(baseDir: string): string {
  const srcDir = path.join(baseDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  return srcDir;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("watcher", () => {
  let tmpDir: string;
  let watcher: Watcher | null;

  beforeEach(() => {
    tmpDir = createTmpDir();
    ensureSrcDir(tmpDir);
    watcher = null;
  });

  afterEach(async () => {
    if (watcher !== null && watcher.isRunning) {
      await stopWatcher(watcher);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("startWatcher creates a watcher with isRunning true", () => {
    // Arrange
    const onChange = vi.fn();

    // Act
    watcher = startWatcher(tmpDir, onChange);

    // Assert
    expect(watcher.isRunning).toBe(true);
  });

  it("stopWatcher stops cleanly and sets isRunning to false", async () => {
    // Arrange
    const onChange = vi.fn();
    watcher = startWatcher(tmpDir, onChange);

    // Act
    await stopWatcher(watcher);

    // Assert
    expect(watcher.isRunning).toBe(false);
  });

  it(
    "triggers onChange callback when a file is created in src/",
    async () => {
      // Arrange
      const onChange = vi.fn();
      watcher = startWatcher(tmpDir, onChange, { debounceMs: 100 });
      await sleep(400);

      // Act
      const filePath = path.join(tmpDir, "src", "hello.ts");
      fs.writeFileSync(filePath, "export const hello = 'world';", "utf-8");
      await sleep(300);

      // Assert
      expect(onChange).toHaveBeenCalled();
      const files: string[] = onChange.mock.calls[0][0];
      expect(files).toContain("src/hello.ts");
    },
    10_000,
  );

  it(
    "debounces multiple rapid changes into a single callback invocation",
    async () => {
      // Arrange
      const onChange = vi.fn();
      watcher = startWatcher(tmpDir, onChange, { debounceMs: 200 });
      await sleep(400);

      // Act - create 3 files synchronously (all writes complete before any timer fires)
      fs.writeFileSync(path.join(tmpDir, "src", "a.ts"), "a", "utf-8");
      fs.writeFileSync(path.join(tmpDir, "src", "b.ts"), "b", "utf-8");
      fs.writeFileSync(path.join(tmpDir, "src", "c.ts"), "c", "utf-8");
      await sleep(500);

      // Assert
      expect(onChange).toHaveBeenCalledTimes(1);
      const files: string[] = onChange.mock.calls[0][0];
      expect(files).toHaveLength(3);
      expect(files).toContain("src/a.ts");
      expect(files).toContain("src/b.ts");
      expect(files).toContain("src/c.ts");
    },
    10_000,
  );

  it(
    "does not fire onChange when file is created in an ignored directory",
    async () => {
      // Arrange
      const onChange = vi.fn();
      const ignoreDir = path.join(tmpDir, "node_modules");
      fs.mkdirSync(ignoreDir, { recursive: true });
      watcher = startWatcher(tmpDir, onChange, { debounceMs: 100 });
      await sleep(400);

      // Act
      fs.writeFileSync(
        path.join(ignoreDir, "should-be-ignored.ts"),
        "ignored",
        "utf-8",
      );
      await sleep(300);

      // Assert
      expect(onChange).not.toHaveBeenCalled();
    },
    10_000,
  );

  it(
    "stops receiving events after stopWatcher is called",
    async () => {
      // Arrange
      const onChange = vi.fn();
      watcher = startWatcher(tmpDir, onChange, { debounceMs: 100 });
      await sleep(400);
      await stopWatcher(watcher);

      // Act
      fs.writeFileSync(
        path.join(tmpDir, "src", "after-close.ts"),
        "should not be detected",
        "utf-8",
      );
      await sleep(300);

      // Assert
      expect(onChange).not.toHaveBeenCalled();
    },
    10_000,
  );

  it("accepts custom ignorePatterns via options", () => {
    // Arrange
    const onChange = vi.fn();
    const customIgnores = ["**/custom-ignore/**"];

    // Act
    watcher = startWatcher(tmpDir, onChange, {
      ignorePatterns: customIgnores,
    });

    // Assert
    expect(watcher.isRunning).toBe(true);
  });

  it("does not mutate the files array between onChange calls", async () => {
    // Arrange
    const capturedBatches: string[][] = [];
    const onChange = (files: string[]): void => {
      capturedBatches.push(files);
    };
    watcher = startWatcher(tmpDir, onChange, { debounceMs: 100 });
    await sleep(400);

    // Act - batch 1
    fs.writeFileSync(path.join(tmpDir, "src", "x.ts"), "x", "utf-8");
    await sleep(300);

    // Act - batch 2
    fs.writeFileSync(path.join(tmpDir, "src", "y.ts"), "y", "utf-8");
    await sleep(300);

    // Assert - both batches were independent
    expect(capturedBatches.length).toBeGreaterThanOrEqual(2);
    const firstCallFiles = [...capturedBatches[0]].sort();
    const secondCallFiles = [...capturedBatches[1]].sort();
    expect(firstCallFiles).toEqual(["src/x.ts"]);
    expect(secondCallFiles).toEqual(["src/y.ts"]);
    // First batch should not have been mutated by the second
    expect(capturedBatches[0]).toEqual(["src/x.ts"]);
  },
    10_000,
  );
});
