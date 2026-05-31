import { watch as chokidarWatch } from "chokidar";
import type { FSWatcher } from "chokidar";

export interface Watcher {
  readonly isRunning: boolean;
  close(): Promise<void>;
}

export interface WatchOptions {
  /** Debounce window in milliseconds. Default: 500 */
  debounceMs?: number;
  /** Additional ignore patterns beyond the defaults */
  ignorePatterns?: string[];
}

const SOURCE_GLOB = "src/**/*.{ts,tsx,js,jsx,py,go,rs,java,kt,rb,php,cs,swift,c,cpp,h,hpp}";

const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.sdd-exoskeleton/**",
  "**/sdd-vault/**",
  "**/openspec/**",
];

function buildWatcher(
  fsw: FSWatcher,
): Watcher {
  let running = true;

  return {
    get isRunning(): boolean {
      return running;
    },
    async close(): Promise<void> {
      await fsw.close();
      running = false;
    },
  };
}

/**
 * Start a file watcher on the project's `src/` directory.
 * Changes are debounced so that multiple rapid edits fire `onChange` once with
 * the full list of affected files.
 */
export function startWatcher(
  projectDir: string,
  onChange: (files: string[]) => void,
  options?: WatchOptions,
): Watcher {
  const debounceMs = options?.debounceMs ?? 500;
  const extraIgnores = options?.ignorePatterns ?? [];

  const ignored = [...DEFAULT_IGNORE, ...extraIgnores];

  const fsw = chokidarWatch(SOURCE_GLOB, {
    cwd: projectDir,
    ignored,
    ignoreInitial: true,
  });

  let collectedFiles: string[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    if (collectedFiles.length === 0) return;
    const files = [...collectedFiles];
    collectedFiles = [];
    onChange(files);
  };

  const scheduleFlush = (): void => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      flush();
    }, debounceMs);
  };

  fsw.on("all", (_eventName: string, filePath: string) => {
    if (!collectedFiles.includes(filePath)) {
      collectedFiles = [...collectedFiles, filePath];
    }
    scheduleFlush();
  });

  fsw.on("error", (_error: Error) => {
    // Errors are handled silently; the watcher remains running.
  });

  return buildWatcher(fsw);
}

/**
 * Gracefully stop a file watcher and wait for all pending teardown to complete.
 */
export async function stopWatcher(watcher: Watcher): Promise<void> {
  await watcher.close();
}
