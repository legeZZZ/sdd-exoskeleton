import * as fs from "node:fs";
import * as path from "node:path";
import simpleGit from "simple-git";

/**
 * Check if a git repository exists in or above the given directory.
 */
export async function isRepo(dir: string): Promise<boolean> {
  const resolved = path.resolve(dir);
  let current: string = resolved;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const gitPath = path.join(current, ".git");
    if (fs.existsSync(gitPath)) {
      return true;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return false;
    }
    current = parent;
  }
}

/**
 * Get list of files changed between a ref and HEAD.
 * Equivalent to: git diff --name-only <since> HEAD
 */
export async function getChangedFiles(since: string, dir: string): Promise<string[]> {
  const git = simpleGit(dir);
  const result = await git.diff([`${since}..HEAD`, "--name-only"]);
  if (!result) return [];
  return result.split("\n").filter((line) => line.length > 0);
}

/**
 * Get the git object hash for a file.
 * Equivalent to: git hash-object <path>
 */
export async function getFileHash(filePath: string): Promise<string> {
  const dir = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const git = simpleGit(dir);
  const result = await git.raw(["hash-object", fileName]);
  return result.trim();
}

/**
 * Get the full SHA of the current HEAD commit.
 * Equivalent to: git rev-parse HEAD
 */
export async function getCurrentRef(dir: string): Promise<string> {
  const git = simpleGit(dir);
  const result = await git.revparse(["HEAD"]);
  return result.trim();
}
