import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export function mkdirp(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function safeWrite(filePath: string, content: string): void {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf-8");
}

export function safeRead(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Walk up the directory tree from `fromDir` looking for a file matching `pattern`.
 * Returns the full path of the first match, or null if the root is reached.
 */
export function findUp(pattern: string | RegExp, fromDir: string): string | null {
  const resolved = path.resolve(fromDir);
  let current: string = resolved;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const entries = listDir(current);
    const match = entries.find((entry) => {
      if (typeof pattern === "string") {
        return entry === pattern;
      }
      return pattern.test(entry);
    });

    if (match !== undefined) {
      return path.join(current, match);
    }

    const parent = path.dirname(current);
    if (parent === current) {
      // Reached filesystem root
      return null;
    }
    current = parent;
  }
}

/**
 * Read a file and return its SHA-256 hex hash.
 */
export function hashContent(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Read directory entries (basenames only) in the given directory.
 * Returns an empty array if the directory does not exist.
 */
export function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}
