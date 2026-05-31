import * as path from "node:path";
import * as fs from "node:fs";

import type { ModuleInfo } from "../integrations/codegraph.js";
import type { ApiInfo, DataModelInfo } from "../integrations/obsidian.js";
import type { ModuleTopology } from "../analyzers/structure.js";
import { safeWrite, mkdirp } from "../utils/fs.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported note types for frontmatter generation. */
type NoteType = "module" | "api" | "data-model" | "moc";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FRONTMATTER_DELIMITER = "---";

const MODULES_DIR = "modules";
const APIS_DIR = "apis";
const DATA_DIR = "data";

const MOC_PLACEHOLDER = "_No %s indexed yet._";

// ---------------------------------------------------------------------------
// generateModuleNotes
// ---------------------------------------------------------------------------

/**
 * Write one Obsidian note per module inside `<vaultPath>/modules/`.
 *
 * Each note has YAML frontmatter, a self-referencing [[wikilink]] heading,
 * a file listing, an exports listing, and related links to APIs and data
 * models that live in the same module.
 */
export function generateModuleNotes(
  modules: readonly ModuleInfo[],
  vaultPath: string,
): void {
  const modulesDir = path.join(vaultPath, MODULES_DIR);
  mkdirp(modulesDir);

  for (const mod of modules) {
    const content = buildModuleNote(mod);
    const filePath = path.join(modulesDir, `${mod.name}.md`);
    safeWrite(filePath, content);
  }
}

// ---------------------------------------------------------------------------
// generateApiNotes
// ---------------------------------------------------------------------------

/**
 * Write one Obsidian note per API inside `<vaultPath>/apis/`.
 */
export function generateApiNotes(
  apis: readonly ApiInfo[],
  vaultPath: string,
): void {
  const apisDir = path.join(vaultPath, APIS_DIR);
  mkdirp(apisDir);

  for (const api of apis) {
    const content = buildApiNote(api);
    const filePath = path.join(apisDir, `${api.name}.md`);
    safeWrite(filePath, content);
  }
}

// ---------------------------------------------------------------------------
// generateDataModelNotes
// ---------------------------------------------------------------------------

/**
 * Write one Obsidian note per data model inside `<vaultPath>/data/`.
 */
export function generateDataModelNotes(
  models: readonly DataModelInfo[],
  vaultPath: string,
): void {
  const dataDir = path.join(vaultPath, DATA_DIR);
  mkdirp(dataDir);

  for (const model of models) {
    const content = buildDataModelNote(model);
    const filePath = path.join(dataDir, `${model.name}.md`);
    safeWrite(filePath, content);
  }
}

// ---------------------------------------------------------------------------
// generateIndexNote
// ---------------------------------------------------------------------------

/**
 * Generate a root MOC (Map of Content) index at `<vaultPath>/index.md`.
 *
 * Modules are sourced from the topology.  APIs and data models are discovered
 * by scanning the vault subdirectories so the function remains composable --
 * notes can be generated in any order, and the index picks up everything.
 *
 * Wikilinks are grouped by type (modules, apis, data) and sorted
 * alphabetically.  Empty sections show a placeholder message.
 */
export function generateIndexNote(
  topology: ModuleTopology,
  vaultPath: string,
): void {
  const indexContent = buildIndexNote(topology, vaultPath);
  const filePath = path.join(vaultPath, "index.md");
  safeWrite(filePath, indexContent);
}

// ---------------------------------------------------------------------------
// Note builders (pure functions – return string, no side effects)
// ---------------------------------------------------------------------------

function buildFrontmatter(
  metadata: Readonly<Record<string, string | undefined>>,
  noteType: NoteType,
): string {
  const lines: string[] = [FRONTMATTER_DELIMITER];

  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push(`type: ${noteType}`);
  lines.push("tags: [sdd, auto-generated]");
  lines.push(FRONTMATTER_DELIMITER);

  return lines.join("\n");
}

function buildModuleNote(mod: ModuleInfo): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push(
    buildFrontmatter({ module: mod.name }, "module"),
  );
  lines.push("");

  // Heading
  lines.push(`# [[${mod.name}]]`);
  lines.push("");

  // Files
  lines.push("## Files");
  lines.push("");
  if (mod.files.length > 0) {
    for (const file of mod.files) {
      lines.push(`- ${file}`);
    }
  } else {
    lines.push("_No files._");
  }
  lines.push("");

  // Exports
  lines.push("## Exports");
  lines.push("");
  if (mod.exports.length > 0) {
    for (const exp of mod.exports) {
      lines.push(`- ${exp}`);
    }
  } else {
    lines.push("_No exports detected._");
  }
  lines.push("");

  return lines.join("\n");
}

function buildApiNote(api: ApiInfo): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push(
    buildFrontmatter({ module: api.module }, "api"),
  );
  lines.push("");

  // Heading (wikilink with display alias)
  lines.push(`# [[${APIS_DIR}/${api.name}|${api.name}]]`);
  lines.push("");

  // Details
  lines.push(`**Route:** \`${api.route}\``);
  lines.push(`**Method:** \`${api.method}\``);
  lines.push(`**Module:** [[${api.module}]]`);
  lines.push("");

  return lines.join("\n");
}

function buildDataModelNote(model: DataModelInfo): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push(
    buildFrontmatter({ name: model.name }, "data-model"),
  );
  lines.push("");

  // Heading (wikilink with display alias)
  lines.push(`# [[${DATA_DIR}/${model.name}|${model.name}]]`);
  lines.push("");

  // Table
  lines.push(`**Table:** \`${model.table}\``);
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

  return lines.join("\n");
}

function buildIndexNote(topology: ModuleTopology, vaultPath: string): string {
  const lines: string[] = [];

  // Frontmatter (no "module" field for MOC)
  lines.push(
    buildFrontmatter({}, "moc"),
  );
  lines.push("");

  // Title
  lines.push("# Project Modules");
  lines.push("");

  // -- Modules ----------------------------------------------------------------
  lines.push("## Modules");
  lines.push("");
  if (topology.modules.length > 0) {
    const sorted = [...topology.modules].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const mod of sorted) {
      lines.push(`- [[${MODULES_DIR}/${mod.name}|${mod.name}]]`);
    }
  } else {
    lines.push(MOC_PLACEHOLDER.replace("%s", "modules"));
  }
  lines.push("");

  // -- APIs -------------------------------------------------------------------
  lines.push("## APIs");
  lines.push("");
  const apiNames = listNoteNames(vaultPath, APIS_DIR);
  if (apiNames.length > 0) {
    for (const name of apiNames) {
      lines.push(`- [[${APIS_DIR}/${name}|${name}]]`);
    }
  } else {
    lines.push(MOC_PLACEHOLDER.replace("%s", "APIs"));
  }
  lines.push("");

  // -- Data Models ------------------------------------------------------------
  lines.push("## Data Models");
  lines.push("");
  const dataNames = listNoteNames(vaultPath, DATA_DIR);
  if (dataNames.length > 0) {
    for (const name of dataNames) {
      lines.push(`- [[${DATA_DIR}/${name}|${name}]]`);
    }
  } else {
    lines.push(MOC_PLACEHOLDER.replace("%s", "data models"));
  }
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Scan a vault subdirectory for `.md` files and return a sorted list of
 * basenames without extensions (the note names).
 */
function listNoteNames(vaultPath: string, subdir: string): string[] {
  const dir = path.join(vaultPath, subdir);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name.replace(/\.md$/, ""))
    .sort((a, b) => a.localeCompare(b));
}
