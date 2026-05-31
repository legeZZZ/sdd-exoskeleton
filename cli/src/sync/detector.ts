import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import simpleGit from "simple-git";
import { getChangedFiles } from "../utils/git.js";
import { hashContent } from "../utils/fs.js";

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
  previousPath?: string;
}

export interface SymbolChange {
  name: string;
  type: "added" | "modified" | "removed" | "renamed";
  module: string;
  summary: string;
  affectedApis: string[];
  affectedModules: string[];
}

/**
 * Detect files changed between a historical ref and HEAD.
 * Uses `getChangedFiles` for the file list, then determines each file's
 * status by comparing its existence and content in both states.
 */
export async function detectChanges(
  projectDir: string,
  since: string,
): Promise<ChangedFile[]> {
  const files = await getChangedFiles(since, projectDir);
  if (files.length === 0) return [];

  const git = simpleGit(projectDir);
  const results: ChangedFile[] = [];

  for (const file of files) {
    const fullPath = path.join(projectDir, file);
    const existsNow = fs.existsSync(fullPath);

    let existsOld = false;
    try {
      await git.raw(["cat-file", "-e", `${since}:${file}`]);
      existsOld = true;
    } catch {
      existsOld = false;
    }

    if (!existsOld && existsNow) {
      results.push({ path: file, status: "added" });
    } else if (existsOld && !existsNow) {
      results.push({ path: file, status: "removed" });
    } else if (existsOld && existsNow) {
      const currentHash = hashContent(fullPath);
      try {
        const oldContent = await git.raw(["show", `${since}:${file}`]);
        const oldHash = crypto
          .createHash("sha256")
          .update(oldContent)
          .digest("hex");
        if (currentHash !== oldHash) {
          results.push({ path: file, status: "modified" });
        }
      } catch {
        // If we can't read the old content, treat as modified
        results.push({ path: file, status: "modified" });
      }
    }
  }

  return results;
}

function extractModule(filePath: string): string {
  const parts = filePath.split("/");
  const srcIndex = parts.indexOf("src");
  if (srcIndex >= 0 && srcIndex < parts.length - 1) {
    return parts[srcIndex + 1];
  }
  return parts.length > 1 ? parts[0] : "";
}

function fileNameToSymbol(filePath: string): string {
  const baseName = path.basename(filePath, path.extname(filePath));
  return baseName
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * Map changed files to high-level symbol changes.
 *
 * In this simplified version, symbols are inferred from file paths.
 * Future tasks will integrate CodeGraph MCP for real symbol resolution.
 */
export async function resolveSymbols(
  files: ChangedFile[],
  _projectDir: string,
): Promise<SymbolChange[]> {
  return files.map((file) => ({
    name: fileNameToSymbol(file.path),
    type: file.status,
    module: extractModule(file.path),
    summary: `${file.status} file ${file.path}`,
    affectedApis: [],
    affectedModules: [],
  }));
}

/**
 * Classify symbol changes into groups by change type.
 * Returns four arrays sorted alphabetically by symbol name.
 * The input array is never mutated.
 */
export function classifyChanges(changes: SymbolChange[]): {
  added: SymbolChange[];
  modified: SymbolChange[];
  removed: SymbolChange[];
  renamed: SymbolChange[];
} {
  const added: SymbolChange[] = [];
  const modified: SymbolChange[] = [];
  const removed: SymbolChange[] = [];
  const renamed: SymbolChange[] = [];

  for (const change of changes) {
    switch (change.type) {
      case "added":
        added.push(change);
        break;
      case "modified":
        modified.push(change);
        break;
      case "removed":
        removed.push(change);
        break;
      case "renamed":
        renamed.push(change);
        break;
    }
  }

  const sortByName = (items: SymbolChange[]): SymbolChange[] =>
    [...items].sort((a, b) => a.name.localeCompare(b.name));

  return {
    added: sortByName(added),
    modified: sortByName(modified),
    removed: sortByName(removed),
    renamed: sortByName(renamed),
  };
}

export { hashContent };
