import * as fs from "node:fs";
import * as path from "node:path";

import type { ModuleInfo } from "./codegraph.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiInfo {
  name: string;
  route: string;
  method: string;
  module: string;
}

export interface DataModelInfo {
  name: string;
  table: string;
  columns: string[];
}

export type VaultStrategy = "embedded" | "standalone" | "hybrid";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HYBRID_VAULT_DIR = "sdd-vault";

const SUBDIRS: readonly string[] = [
  "modules",
  "apis",
  "data",
  "journal",
  "decisions",
  "templates",
];

const OBSIDIAN_DIR = ".obsidian";

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the Obsidian vault structure.
 *
 * - `embedded`: the project directory IS the vault — only creates `.obsidian/`
 *   config and vault subdirectories inside the existing project.
 * - `standalone`: creates a vault at the given `projectDir` (treated as a
 *   dedicated vault path).
 * - `hybrid`: creates `sdd-vault/` inside the project directory with its own
 *   `.obsidian/` config and subdirectories.
 *
 * Returns the resolved vault path.
 */
export function initVault(
  projectDir: string,
  strategy: VaultStrategy,
): string {
  const vaultPath =
    strategy === "hybrid"
      ? path.join(projectDir, HYBRID_VAULT_DIR)
      : projectDir;

  ensureDir(vaultPath);

  // Subdirectories always go under the vault root.
  for (const sub of SUBDIRS) {
    ensureDir(path.join(vaultPath, sub));
  }

  // .obsidian config
  const obsidianDir = path.join(vaultPath, OBSIDIAN_DIR);
  ensureDir(obsidianDir);

  const appJsonPath = path.join(obsidianDir, "app.json");
  if (!fs.existsSync(appJsonPath)) {
    const vaultName = path.basename(vaultPath);
    const appConfig = {
      vaultName,
    };
    fs.writeFileSync(appJsonPath, JSON.stringify(appConfig, null, 2), "utf-8");
  }

  return vaultPath;
}

/**
 * Write a module note inside `vaultPath/modules/`.
 */
export function writeModuleNote(vaultPath: string, module: ModuleInfo): void {
  const modulesDir = path.join(vaultPath, "modules");
  ensureDir(modulesDir);

  const filePath = path.join(modulesDir, `${module.name}.md`);

  const lines: string[] = [];

  // Frontmatter
  lines.push("---");
  lines.push(`module: ${module.name}`);
  lines.push("type: module");
  lines.push("tags: [sdd, auto-generated, module]");
  lines.push(`created: ${todayString()}`);
  lines.push("---");
  lines.push("");
  lines.push(`# Module: ${module.name}`);
  lines.push("");

  // Files
  lines.push("## Files");
  lines.push("");
  for (const file of module.files) {
    lines.push(`- ${file}`);
  }
  lines.push("");

  // Exports
  lines.push("## Exports");
  lines.push("");
  if (module.exports.length > 0) {
    for (const exp of module.exports) {
      lines.push(`- ${exp}`);
    }
  } else {
    lines.push("_No exports detected._");
  }
  lines.push("");

  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

/**
 * Write an API note inside `vaultPath/apis/`.
 */
export function writeApiNote(vaultPath: string, api: ApiInfo): void {
  const apisDir = path.join(vaultPath, "apis");
  ensureDir(apisDir);

  const filePath = path.join(apisDir, `${api.name}.md`);

  const lines: string[] = [];

  // Frontmatter
  lines.push("---");
  lines.push(`name: ${api.name}`);
  lines.push("type: api");
  lines.push(`route: ${api.route}`);
  lines.push(`method: ${api.method}`);
  lines.push(`module: ${api.module}`);
  lines.push("tags: [sdd, auto-generated, api]");
  lines.push(`created: ${todayString()}`);
  lines.push("---");
  lines.push("");
  lines.push(`# API: ${api.name}`);
  lines.push("");
  lines.push("## Details");
  lines.push("");
  lines.push(`- **Route:** \`${api.route}\``);
  lines.push(`- **Method:** ${api.method}`);
  lines.push(`- **Module:** [[modules/${api.module}|${api.module}]]`);
  lines.push("");

  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

/**
 * Write a data-model note inside `vaultPath/data/`.
 */
export function writeDataModelNote(
  vaultPath: string,
  model: DataModelInfo,
): void {
  const dataDir = path.join(vaultPath, "data");
  ensureDir(dataDir);

  const filePath = path.join(dataDir, `${model.name}.md`);

  const lines: string[] = [];

  // Frontmatter
  lines.push("---");
  lines.push(`name: ${model.name}`);
  lines.push("type: data-model");
  lines.push(`table: ${model.table}`);
  lines.push("tags: [sdd, auto-generated, data-model]");
  lines.push(`created: ${todayString()}`);
  lines.push("---");
  lines.push("");
  lines.push(`# Data Model: ${model.name}`);
  lines.push("");
  lines.push("## Table");
  lines.push("");
  lines.push(`- **Table name:** \`${model.table}\``);
  lines.push("");

  // Columns
  lines.push("## Columns");
  lines.push("");
  if (model.columns.length > 0) {
    for (const col of model.columns) {
      lines.push(`- \`${col}\``);
    }
  } else {
    lines.push("_No columns defined._");
  }
  lines.push("");

  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

/**
 * Write a Map-of-Content index note at the vault root.
 * Uses `[[wikilinks]]` (Obsidian format) rather than Markdown `[text](path)`.
 */
export function writeIndexNote(
  vaultPath: string,
  modules: ModuleInfo[],
  apis: ApiInfo[],
  models: DataModelInfo[],
): void {
  const filePath = path.join(vaultPath, "README.md");

  const lines: string[] = [];

  lines.push("# SDD Vault — Map of Content");
  lines.push("");
  lines.push(
    "This vault is auto-generated by the SDD Exoskeleton. Links use Obsidian [[wikilinks]] format.",
  );
  lines.push("");

  // Modules
  lines.push("## Modules");
  lines.push("");
  if (modules.length > 0) {
    for (const mod of modules) {
      lines.push(`- [[modules/${mod.name}|${mod.name}]]`);
    }
  } else {
    lines.push("_No modules indexed._");
  }
  lines.push("");

  // APIs
  lines.push("## APIs");
  lines.push("");
  if (apis.length > 0) {
    for (const api of apis) {
      lines.push(`- [[apis/${api.name}|${api.name}]] (${api.method} ${api.route})`);
    }
  } else {
    lines.push("_No APIs indexed._");
  }
  lines.push("");

  // Data Models
  lines.push("## Data Models");
  lines.push("");
  if (models.length > 0) {
    for (const model of models) {
      lines.push(`- [[data/${model.name}|${model.name}]] (\`${model.table}\`)`);
    }
  } else {
    lines.push("_No data models indexed._");
  }
  lines.push("");

  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

/**
 * Copy template files into `vaultPath/templates/`.
 *
 * Templates created:
 * - `daily-journal.md`
 * - `adr.md`
 * - `sync-log.md`
 */
export function copyTemplates(vaultPath: string): void {
  const templatesDir = path.join(vaultPath, "templates");
  ensureDir(templatesDir);

  // Daily Journal
  writeTemplate(
    path.join(templatesDir, "daily-journal.md"),
    [
      "---",
      "type: daily-journal",
      `date: ${todayString()}`,
      "tags: [journal]",
      "---",
      "",
      "# Daily Journal",
      "",
      "## Standup",
      "",
      "- **Yesterday:** ",
      "- **Today:** ",
      "- **Blockers:** ",
      "",
      "## Notes",
      "",
    ].join("\n"),
  );

  // ADR (Architecture Decision Record)
  writeTemplate(
    path.join(templatesDir, "adr.md"),
    [
      "---",
      "type: adr",
      `date: ${todayString()}`,
      "status: proposed",
      "tags: [architecture, decision]",
      "---",
      "",
      "# ADR: <title>",
      "",
      "## Context",
      "",
      "## Decision",
      "",
      "## Consequences",
      "",
      "## Alternatives Considered",
      "",
    ].join("\n"),
  );

  // Sync Log
  writeTemplate(
    path.join(templatesDir, "sync-log.md"),
    [
      "---",
      "type: sync-log",
      `date: ${todayString()}`,
      "tags: [sync, auto-generated]",
      "---",
      "",
      "# Sync Log",
      "",
      "## Summary",
      "",
      "- **Timestamp:** ",
      "- **Strategy:** ",
      "- **Changes Detected:** ",
      "",
      "## Module Changes",
      "",
      "## API Changes",
      "",
      "## Data Model Changes",
      "",
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Like mkdir -p -- no error when the directory already exists. */
function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Write a template file (only if it does not already exist, to avoid
 * overwriting user customisations). */
function writeTemplate(filePath: string, content: string): void {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, "utf-8");
  }
}
