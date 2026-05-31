import * as path from "node:path";
import { safeRead, safeWrite } from "./utils/fs.js";

export interface SddConfig {
  version: string;
  project: { name: string; languages: string[]; rootDir: string; srcDir: string };
  codegraph: { indexPath: string; mcpPort: number };
  openspec: { path: string; changeDir: string };
  obsidian: { vaultPath: string; strategy: "embedded" | "standalone" | "hybrid" };
  sync: { mode: "manual" | "git-hook" | "watch"; lastSyncRef: string; lastSyncAt: string };
}

export const DEFAULT_CONFIG: SddConfig = {
  version: "0.1.0",
  project: { name: "", languages: [], rootDir: "", srcDir: "" },
  codegraph: { indexPath: ".codegraph", mcpPort: 0 },
  openspec: { path: "openspec", changeDir: "openspec/changes" },
  obsidian: { vaultPath: "sdd-vault", strategy: "hybrid" },
  sync: { mode: "manual", lastSyncRef: "", lastSyncAt: "" },
};

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];
    if (
      sourceVal !== null &&
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

export function loadConfig(rootDir: string): SddConfig {
  const configPath = path.join(rootDir, ".sdd-exoskeleton", "config.json");
  const raw = safeRead(configPath);

  if (raw === null) {
    return structuredClone(DEFAULT_CONFIG);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in config file: ${configPath}`);
  }

  return deepMerge(structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>, parsed) as unknown as SddConfig;
}

export function saveConfig(rootDir: string, config: SddConfig): void {
  const configPath = path.join(rootDir, ".sdd-exoskeleton", "config.json");
  safeWrite(configPath, JSON.stringify(config, null, 2));
}

export function validateConfig(config: SddConfig): string[] {
  const issues: string[] = [];

  if (!config.project) {
    issues.push("project is required");
  } else {
    if (!config.project.name || typeof config.project.name !== "string") {
      issues.push("project.name is required and must be a non-empty string");
    }
    if (!Array.isArray(config.project.languages) || config.project.languages.length === 0) {
      issues.push("project.languages must be a non-empty array");
    }
    if (!config.project.rootDir || typeof config.project.rootDir !== "string") {
      issues.push("project.rootDir is required and must be a non-empty string");
    }
    if (!config.project.srcDir || typeof config.project.srcDir !== "string") {
      issues.push("project.srcDir is required and must be a non-empty string");
    }
  }

  if (!config.obsidian) {
    issues.push("obsidian is required");
  } else {
    const validStrategies = ["embedded", "standalone", "hybrid"];
    if (!validStrategies.includes(config.obsidian.strategy)) {
      issues.push(
        `obsidian.strategy must be one of: ${validStrategies.join(", ")}`,
      );
    }
  }

  if (!config.sync) {
    issues.push("sync is required");
  } else {
    const validModes = ["manual", "git-hook", "watch"];
    if (!validModes.includes(config.sync.mode)) {
      issues.push(`sync.mode must be one of: ${validModes.join(", ")}`);
    }
  }

  return issues;
}
