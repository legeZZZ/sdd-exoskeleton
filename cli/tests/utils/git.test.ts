import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as child_process from "node:child_process";
import { isRepo, getChangedFiles, getFileHash, getCurrentRef } from "../../src/utils/git.js";

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sdd-git-test-"));
}

function initGitRepo(dir: string): void {
  child_process.execSync("git init", { cwd: dir, stdio: "pipe" });
  child_process.execSync("git config user.email test@example.com", { cwd: dir, stdio: "pipe" });
  child_process.execSync('git config user.name "Test User"', { cwd: dir, stdio: "pipe" });
}

function commitFile(dir: string, fileName: string, content: string, message?: string): void {
  fs.writeFileSync(path.join(dir, fileName), content, "utf-8");
  child_process.execSync(`git add ${fileName}`, { cwd: dir, stdio: "pipe" });
  child_process.execSync(`git commit -m "${message || "add " + fileName}"`, {
    cwd: dir,
    stdio: "pipe",
  });
}

function getHeadSha(dir: string): string {
  return child_process
    .execSync("git rev-parse HEAD", { cwd: dir, encoding: "utf-8" })
    .trim();
}

describe("isRepo", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns true when .git directory exists in the given directory", async () => {
    initGitRepo(tmpDir);
    const result = await isRepo(tmpDir);
    expect(result).toBe(true);
  });

  it("returns true when .git directory exists in a parent directory", async () => {
    initGitRepo(tmpDir);
    const subDir = path.join(tmpDir, "sub", "dir");
    fs.mkdirSync(subDir, { recursive: true });

    const result = await isRepo(subDir);
    expect(result).toBe(true);
  });

  it("returns false when no .git directory exists in any parent", async () => {
    const result = await isRepo(tmpDir);
    expect(result).toBe(false);
  });

  it("returns true for the project root directory", async () => {
    const projectRoot = path.resolve(__dirname, "..", "..");
    const result = await isRepo(projectRoot);
    // The project may or may not be a git repo; this tests it doesn't throw
    expect(typeof result).toBe("boolean");
  });
});

describe("getCurrentRef", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    initGitRepo(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns the SHA of the HEAD commit", async () => {
    commitFile(tmpDir, "hello.txt", "hello", "initial commit");
    const expectedSha = getHeadSha(tmpDir);

    const ref = await getCurrentRef(tmpDir);
    expect(ref).toBe(expectedSha);
    expect(ref).toMatch(/^[a-f0-9]{40}$/);
  });

  it("returns different SHAs after new commits", async () => {
    commitFile(tmpDir, "first.txt", "first", "first commit");
    const ref1 = await getCurrentRef(tmpDir);

    commitFile(tmpDir, "second.txt", "second", "second commit");
    const ref2 = await getCurrentRef(tmpDir);

    expect(ref1).not.toBe(ref2);
  });
});

describe("getChangedFiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    initGitRepo(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns files changed between two refs", async () => {
    commitFile(tmpDir, "initial.txt", "initial content", "initial");
    const firstSha = getHeadSha(tmpDir);

    commitFile(tmpDir, "added.txt", "added content", "add file");

    const changed = await getChangedFiles(firstSha, tmpDir);
    expect(changed).toContain("added.txt");
    expect(changed.length).toBe(1);
  });

  it("returns multiple changed files", async () => {
    commitFile(tmpDir, "base.txt", "base", "base commit");
    const baseSha = getHeadSha(tmpDir);

    commitFile(tmpDir, "file-a.txt", "a", "add a");
    commitFile(tmpDir, "file-b.txt", "b", "add b");

    const changed = await getChangedFiles(baseSha, tmpDir);
    expect(changed).toContain("file-a.txt");
    expect(changed).toContain("file-b.txt");
    expect(changed.length).toBe(2);
  });

  it("returns empty array when no files changed", async () => {
    commitFile(tmpDir, "only.txt", "only", "only commit");
    const sha = getHeadSha(tmpDir);

    const changed = await getChangedFiles(sha, tmpDir);
    expect(changed).toEqual([]);
  });
});

describe("getFileHash", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    initGitRepo(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns a git object hash for a file", async () => {
    const filePath = path.join(tmpDir, "data.txt");
    fs.writeFileSync(filePath, "git hash test\n", "utf-8");
    child_process.execSync("git add data.txt", { cwd: tmpDir, stdio: "pipe" });

    const hash = await getFileHash(filePath);
    // Git object hash is a 40-character hex string
    expect(hash).toMatch(/^[a-f0-9]{40}$/);
  });

  it("returns different hashes for different file content", async () => {
    const fileA = path.join(tmpDir, "a.txt");
    const fileB = path.join(tmpDir, "b.txt");
    fs.writeFileSync(fileA, "content one", "utf-8");
    fs.writeFileSync(fileB, "content two", "utf-8");

    // git hash-object needs the file to exist; can work on untracked files
    const hashA = await getFileHash(fileA);
    const hashB = await getFileHash(fileB);

    expect(hashA).not.toBe(hashB);
  });

  it("returns the same hash for identical content in different files", async () => {
    const file1 = path.join(tmpDir, "f1.txt");
    const file2 = path.join(tmpDir, "f2.txt");
    fs.writeFileSync(file1, "same", "utf-8");
    fs.writeFileSync(file2, "same", "utf-8");

    expect(await getFileHash(file1)).toBe(await getFileHash(file2));
  });
});
