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
