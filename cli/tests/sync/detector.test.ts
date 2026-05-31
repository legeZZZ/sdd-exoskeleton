import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as child_process from "node:child_process";
import {
  detectChanges,
  resolveSymbols,
  classifyChanges,
  hashContent,
} from "../../src/sync/detector.js";
import type { ChangedFile, SymbolChange } from "../../src/sync/detector.js";

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sdd-detector-test-"));
}

function initGitRepo(dir: string): void {
  child_process.execSync("git init", { cwd: dir, stdio: "pipe" });
  child_process.execSync("git config user.email test@example.com", {
    cwd: dir,
    stdio: "pipe",
  });
  child_process.execSync('git config user.name "Test User"', {
    cwd: dir,
    stdio: "pipe",
  });
}

function commitFile(
  dir: string,
  fileName: string,
  content: string,
  message?: string,
): void {
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

function removeCommittedFile(dir: string, fileName: string, message: string): void {
  fs.rmSync(path.join(dir, fileName));
  child_process.execSync(`git add ${fileName}`, { cwd: dir, stdio: "pipe" });
  child_process.execSync(`git commit -m "${message}"`, {
    cwd: dir,
    stdio: "pipe",
  });
}

function makeCommit(dir: string, message: string): void {
  child_process.execSync(`git commit --allow-empty -m "${message}"`, {
    cwd: dir,
    stdio: "pipe",
  });
}

describe("detectChanges", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    initGitRepo(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects added files", async () => {
    commitFile(tmpDir, "base.txt", "base content", "initial commit");
    const since = getHeadSha(tmpDir);

    commitFile(tmpDir, "new-file.ts", "new content", "add new file");

    const changes = await detectChanges(tmpDir, since);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: "new-file.ts", status: "added" });
  });

  it("detects removed files", async () => {
    commitFile(tmpDir, "base.txt", "base", "initial commit");
    commitFile(tmpDir, "to-remove.txt", "remove me", "add removable file");
    const since = getHeadSha(tmpDir);

    removeCommittedFile(tmpDir, "to-remove.txt", "remove file");

    const changes = await detectChanges(tmpDir, since);
    const removed = changes.filter((c) => c.status === "removed");
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({
      path: "to-remove.txt",
      status: "removed",
    });
  });

  it("detects modified files", async () => {
    commitFile(tmpDir, "modify-me.txt", "original content", "initial commit");
    const since = getHeadSha(tmpDir);

    // Overwrite file and commit the modification
    fs.writeFileSync(path.join(tmpDir, "modify-me.txt"), "modified content", "utf-8");
    child_process.execSync("git add modify-me.txt", { cwd: tmpDir, stdio: "pipe" });
    child_process.execSync('git commit -m "modify file"', {
      cwd: tmpDir,
      stdio: "pipe",
    });

    const changes = await detectChanges(tmpDir, since);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: "modify-me.txt",
      status: "modified",
    });
  });

  it("returns empty array when no files changed", async () => {
    commitFile(tmpDir, "only.txt", "only content", "only commit");
    const since = getHeadSha(tmpDir);

    // Create an empty commit so we have a new HEAD but no file changes
    makeCommit(tmpDir, "empty commit");

    const changes = await detectChanges(tmpDir, since);
    expect(changes).toEqual([]);
  });

  it("detects multiple files of different types", async () => {
    commitFile(tmpDir, "base.txt", "base content", "initial");
    commitFile(tmpDir, "will-remove.txt", "remove me", "add to-remove");
    commitFile(tmpDir, "will-modify.txt", "original", "add to-modify");
    const since = getHeadSha(tmpDir);

    // Add new file
    commitFile(tmpDir, "new-file.ts", "new", "add new file");
    // Modify existing file
    fs.writeFileSync(
      path.join(tmpDir, "will-modify.txt"),
      "modified content",
      "utf-8",
    );
    child_process.execSync("git add will-modify.txt", {
      cwd: tmpDir,
      stdio: "pipe",
    });
    child_process.execSync('git commit -m "modify file"', {
      cwd: tmpDir,
      stdio: "pipe",
    });
    // Remove file
    removeCommittedFile(tmpDir, "will-remove.txt", "remove will-remove");

    const changes = await detectChanges(tmpDir, since);

    const added = changes.filter((c) => c.status === "added");
    const modified = changes.filter((c) => c.status === "modified");
    const removed = changes.filter((c) => c.status === "removed");

    expect(added).toHaveLength(1);
    expect(added[0].path).toBe("new-file.ts");
    expect(modified).toHaveLength(1);
    expect(modified[0].path).toBe("will-modify.txt");
    expect(removed).toHaveLength(1);
    expect(removed[0].path).toBe("will-remove.txt");
  });

  it("handles files in subdirectories", async () => {
    const subDir = path.join(tmpDir, "src", "auth");
    fs.mkdirSync(subDir, { recursive: true });
    commitFile(tmpDir, "base.txt", "base", "initial commit");
    const since = getHeadSha(tmpDir);

    const nestedFile = "src/auth/login.ts";
    const nestedPath = path.join(tmpDir, nestedFile);
    fs.mkdirSync(path.dirname(nestedPath), { recursive: true });
    fs.writeFileSync(nestedPath, "export const login = () => {};", "utf-8");
    child_process.execSync(`git add ${nestedFile}`, {
      cwd: tmpDir,
      stdio: "pipe",
    });
    child_process.execSync('git commit -m "add nested file"', {
      cwd: tmpDir,
      stdio: "pipe",
    });

    const changes = await detectChanges(tmpDir, since);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: "src/auth/login.ts",
      status: "added",
    });
  });

  it("handles files with special characters in name", async () => {
    commitFile(tmpDir, "base.txt", "base", "initial");
    const since = getHeadSha(tmpDir);

    const fileName = "my-component.util.ts";
    commitFile(tmpDir, fileName, "special name file", "add special file");

    const changes = await detectChanges(tmpDir, since);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: fileName,
      status: "added",
    });
  });
});

describe("resolveSymbols", () => {
  it("maps added files to SymbolChange entries", async () => {
    const files: ChangedFile[] = [
      { path: "src/auth/login.ts", status: "added" },
    ];

    const symbols = await resolveSymbols(files, "/fake/project");

    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({
      name: "Login",
      type: "added",
      module: "auth",
      summary: "added file src/auth/login.ts",
      affectedApis: [],
      affectedModules: [],
    });
  });

  it("maps removed files to SymbolChange entries", async () => {
    const files: ChangedFile[] = [
      { path: "src/utils/old-helper.ts", status: "removed" },
    ];

    const symbols = await resolveSymbols(files, "/fake/project");

    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({
      name: "OldHelper",
      type: "removed",
      module: "utils",
      summary: "removed file src/utils/old-helper.ts",
    });
  });

  it("maps modified files with inferred module", async () => {
    const files: ChangedFile[] = [
      { path: "src/services/payment.ts", status: "modified" },
    ];

    const symbols = await resolveSymbols(files, "/fake/project");

    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({
      name: "Payment",
      type: "modified",
      module: "services",
    });
  });

  it("handles files without a src directory prefix", async () => {
    const files: ChangedFile[] = [
      { path: "lib/helpers.ts", status: "added" },
    ];

    const symbols = await resolveSymbols(files, "/fake/project");

    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({
      name: "Helpers",
      type: "added",
      module: "lib",
    });
  });

  it("handles files at root level (no directory)", async () => {
    const files: ChangedFile[] = [
      { path: "index.ts", status: "modified" },
    ];

    const symbols = await resolveSymbols(files, "/fake/project");

    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({
      name: "Index",
      type: "modified",
      module: "",
    });
  });

  it("handles multiple files of different types", async () => {
    const files: ChangedFile[] = [
      { path: "src/auth/login.ts", status: "added" },
      { path: "src/auth/logout.ts", status: "added" },
      { path: "src/utils/format.ts", status: "modified" },
      { path: "src/old/deprecated.ts", status: "removed" },
    ];

    const symbols = await resolveSymbols(files, "/fake/project");

    expect(symbols).toHaveLength(4);
    expect(symbols.map((s) => s.name)).toEqual([
      "Login",
      "Logout",
      "Format",
      "Deprecated",
    ]);
  });

  it("converts kebab-case and snake_case filenames to PascalCase symbols", async () => {
    const files: ChangedFile[] = [
      { path: "src/components/user-profile.ts", status: "added" },
      { path: "src/components/data_grid.ts", status: "added" },
    ];

    const symbols = await resolveSymbols(files, "/fake/project");

    expect(symbols[0].name).toBe("UserProfile");
    expect(symbols[1].name).toBe("DataGrid");
  });

  it("does not mutate the input array", async () => {
    const files: ChangedFile[] = [
      { path: "src/auth/login.ts", status: "added" },
    ];
    const original = structuredClone(files);

    await resolveSymbols(files, "/fake/project");

    expect(files).toEqual(original);
  });
});

describe("classifyChanges", () => {
  it("classifies changes into four groups by type", () => {
    const changes: SymbolChange[] = [
      {
        name: "Login",
        type: "added",
        module: "auth",
        summary: "added file src/auth/login.ts",
        affectedApis: [],
        affectedModules: [],
      },
      {
        name: "Format",
        type: "modified",
        module: "utils",
        summary: "modified file src/utils/format.ts",
        affectedApis: [],
        affectedModules: [],
      },
      {
        name: "Deprecated",
        type: "removed",
        module: "old",
        summary: "removed file src/old/deprecated.ts",
        affectedApis: [],
        affectedModules: [],
      },
      {
        name: "OldName",
        type: "renamed",
        module: "utils",
        summary: "renamed file...",
        affectedApis: [],
        affectedModules: [],
      },
    ];

    const result = classifyChanges(changes);

    expect(result.added).toHaveLength(1);
    expect(result.added[0].name).toBe("Login");
    expect(result.modified).toHaveLength(1);
    expect(result.modified[0].name).toBe("Format");
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0].name).toBe("Deprecated");
    expect(result.renamed).toHaveLength(1);
    expect(result.renamed[0].name).toBe("OldName");
  });

  it("sorts each group alphabetically by name", () => {
    const changes: SymbolChange[] = [
      {
        name: "Zebra",
        type: "added",
        module: "m",
        summary: "z",
        affectedApis: [],
        affectedModules: [],
      },
      {
        name: "Alpha",
        type: "added",
        module: "m",
        summary: "a",
        affectedApis: [],
        affectedModules: [],
      },
      {
        name: "Middle",
        type: "added",
        module: "m",
        summary: "m",
        affectedApis: [],
        affectedModules: [],
      },
    ];

    const result = classifyChanges(changes);

    expect(result.added).toHaveLength(3);
    expect(result.added.map((c) => c.name)).toEqual([
      "Alpha",
      "Middle",
      "Zebra",
    ]);
    expect(result.modified).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.renamed).toEqual([]);
  });

  it("returns empty arrays when no changes of a type exist", () => {
    const changes: SymbolChange[] = [
      {
        name: "OnlyAdded",
        type: "added",
        module: "m",
        summary: "s",
        affectedApis: [],
        affectedModules: [],
      },
    ];

    const result = classifyChanges(changes);

    expect(result.added).toHaveLength(1);
    expect(result.modified).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.renamed).toEqual([]);
  });

  it("returns all empty arrays for empty input", () => {
    const result = classifyChanges([]);

    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.renamed).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const changes: SymbolChange[] = [
      {
        name: "Test",
        type: "added",
        module: "m",
        summary: "s",
        affectedApis: [],
        affectedModules: [],
      },
    ];
    const original = structuredClone(changes);

    classifyChanges(changes);

    expect(changes).toEqual(original);
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

  it("returns a SHA-256 hex hash", () => {
    const filePath = path.join(tmpDir, "test.txt");
    fs.writeFileSync(filePath, "hello", "utf-8");

    const hash = hashContent(filePath);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns consistent results for the same content", () => {
    const fileA = path.join(tmpDir, "a.txt");
    const fileB = path.join(tmpDir, "b.txt");
    fs.writeFileSync(fileA, "identical", "utf-8");
    fs.writeFileSync(fileB, "identical", "utf-8");

    expect(hashContent(fileA)).toBe(hashContent(fileB));
  });

  it("returns different results for different content", () => {
    const fileA = path.join(tmpDir, "a.txt");
    const fileB = path.join(tmpDir, "b.txt");
    fs.writeFileSync(fileA, "content-one", "utf-8");
    fs.writeFileSync(fileB, "content-two", "utf-8");

    expect(hashContent(fileA)).not.toBe(hashContent(fileB));
  });
});
