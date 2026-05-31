import * as path from "node:path";
import { safeRead, safeWrite } from "./utils/fs.js";

export interface SyncEntry {
  lastHash: string;
  lastSyncedAt: string;
  mappedSpecs: string[];
  mappedObsidianNodes: string[];
}

export interface SyncState {
  entries: Record<string, SyncEntry>;
}

const EMPTY_STATE: SyncState = { entries: {} };

export function loadSyncState(rootDir: string): SyncState {
  const statePath = path.join(rootDir, ".sdd-exoskeleton", "sync-state.json");
  const raw = safeRead(statePath);

  if (raw === null) {
    return { entries: {} };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      entries: parsed.entries ?? {},
    };
  } catch {
    throw new Error(`Invalid JSON in sync state file: ${statePath}`);
  }
}

export function saveSyncState(rootDir: string, state: SyncState): void {
  const statePath = path.join(rootDir, ".sdd-exoskeleton", "sync-state.json");
  safeWrite(statePath, JSON.stringify(state, null, 2));
}

export function diffState(
  oldState: SyncState,
  newState: SyncState,
): { added: string[]; modified: string[]; removed: string[] } {
  const oldKeys = new Set(Object.keys(oldState.entries));
  const newKeys = new Set(Object.keys(newState.entries));

  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];

  for (const key of newKeys) {
    if (!oldKeys.has(key)) {
      added.push(key);
    } else if (oldState.entries[key].lastHash !== newState.entries[key].lastHash) {
      modified.push(key);
    }
  }

  for (const key of oldKeys) {
    if (!newKeys.has(key)) {
      removed.push(key);
    }
  }

  return { added, modified, removed };
}
