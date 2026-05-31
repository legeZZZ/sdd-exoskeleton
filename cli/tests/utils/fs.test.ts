import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { findUp, hashContent, listDir, safeWrite } from "../../src/utils/fs.js";

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sdd-fs-test-"));
}

describe("findUp", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds a file matching a string pattern in a parent directory", () => {
    // Create a marker file in the root of tmpDir
    safeWrite(path.join(tmpDir, ".marker"), "test");
    // Create a nested directory hierarchy
    const deepDir = path.join(tmpDir, "a", "b", "c", "d");
    fs.mkdirSync(deepDir, { recursive: true });

    const result = findUp(".marker", deepDir);
    expect(result).toBe(path.join(tmpDir, ".marker"));
  });

  it("finds a file matching a RegExp pattern in a parent directory", () => {
    safeWrite(path.join(tmpDir, "package.json"), "{}");
    const deepDir = path.join(tmpDir, "x", "y");
    fs.mkdirSync(deepDir, { recursive: true });

    const result = findUp(/^package\.json$/, deepDir);
    expect(result).toBe(path.join(tmpDir, "package.json"));
  });

  it("returns null when no matching file is found up to root", () => {
    const deepDir = path.join(tmpDir, "no", "match", "here");
    fs.mkdirSync(deepDir, { recursive: true });

    const result = findUp("nonexistent.file", deepDir);
    expect(result).toBeNull();
  });

  it("finds the file in the starting directory itself", () => {
    safeWrite(path.join(tmpDir, "config.yaml"), "key: val");

    const result = findUp("config.yaml", tmpDir);
    expect(result).toBe(path.join(tmpDir, "config.yaml"));
  });

  it("returns the first match encountered when walking up (closest to fromDir)", () => {
    // Place marker in two levels
    safeWrite(path.join(tmpDir, ".marker"), "root");
    const midDir = path.join(tmpDir, "mid");
    fs.mkdirSync(midDir, { recursive: true });
    safeWrite(path.join(midDir, ".marker"), "mid");
    const deepDir = path.join(midDir, "deep");
    fs.mkdirSync(deepDir, { recursive: true });

    // Starting from deepDir, should find mid's marker first
    const result = findUp(".marker", deepDir);
    expect(result).toBe(path.join(midDir, ".marker"));
  });

  it("handles a relative fromDir by resolving it", () => {
    safeWrite(path.join(tmpDir, "target.txt"), "data");
    const subDir = path.join(tmpDir, "sub", "dir");
    fs.mkdirSync(subDir, { recursive: true });

    // Create a relative path from cwd to the subDir
    const relativeDir = path.relative(process.cwd(), subDir);

    const result = findUp("target.txt", relativeDir);
    // Result should be an absolute path
    expect(result).toBe(path.join(tmpDir, "target.txt"));
  });
});

describe("hashContent", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns a SHA-256 hex hash of file content", () => {
    const filePath = path.join(tmpDir, "data.txt");
    fs.writeFileSync(filePath, "hello world\n", "utf-8");

    const hash = hashContent(filePath);
    // SHA-256 of "hello world\n" should be a 64-character hex string
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns different hashes for different content", () => {
    const fileA = path.join(tmpDir, "a.txt");
    const fileB = path.join(tmpDir, "b.txt");
    fs.writeFileSync(fileA, "content A", "utf-8");
    fs.writeFileSync(fileB, "content B", "utf-8");

    const hashA = hashContent(fileA);
    const hashB = hashContent(fileB);

    expect(hashA).not.toBe(hashB);
  });

  it("returns the same hash for identical content", () => {
    const file1 = path.join(tmpDir, "f1.txt");
    const file2 = path.join(tmpDir, "f2.txt");
    fs.writeFileSync(file1, "same content", "utf-8");
    fs.writeFileSync(file2, "same content", "utf-8");

    expect(hashContent(file1)).toBe(hashContent(file2));
  });

  it("returns a consistent known hash for a specific input", () => {
    const filePath = path.join(tmpDir, "known.txt");
    fs.writeFileSync(filePath, "test", "utf-8");

    // SHA-256 of "test" with no trailing newline:
    // echo -n "test" | shasum -a 256
    // 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
    expect(hashContent(filePath)).toBe(
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    );
  });

  it("throws for a nonexistent file", () => {
    expect(() => hashContent(path.join(tmpDir, "no-such-file"))).toThrow();
  });
});

describe("listDir", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists basenames of entries in a directory", () => {
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "a");
    fs.writeFileSync(path.join(tmpDir, "b.txt"), "b");
    fs.mkdirSync(path.join(tmpDir, "subdir"));

    const entries = listDir(tmpDir);
    expect(entries).toContain("a.txt");
    expect(entries).toContain("b.txt");
    expect(entries).toContain("subdir");
    expect(entries.length).toBe(3);
  });

  it("returns an empty array for an empty directory", () => {
    const entries = listDir(tmpDir);
    expect(entries).toEqual([]);
  });

  it("returns an empty array for a nonexistent directory", () => {
    const entries = listDir(path.join(tmpDir, "does-not-exist"));
    expect(entries).toEqual([]);
  });
});
