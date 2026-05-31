import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpecDoc {
  title: string;
  module: string;
  description: string;
  classes: { name: string; description: string }[];
  apis: { name: string; signature: string; description: string }[];
  dependencies: string[];
}

export interface SchemaDoc {
  title: string;
  table: string;
  columns: {
    name: string;
    type: string;
    nullable?: boolean;
    description?: string;
  }[];
  relations: { target: string; type: string; via: string }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPENSPEC_DIR = "openspec";
const SPECS_DIR = "specs";
const CHANGES_DIR = "changes";
const ACTIVE_DIR = "active";
const ARCHIVE_DIR = "archive";
const SCHEMAS_DIR = "schemas";
const PROPOSAL_FILE = "proposal.md";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise the OpenSpec directory tree inside `projectDir`.
 * Creates openspec/specs, openspec/changes/active, openspec/changes/archive,
 * and openspec/schemas.  Does nothing when the directory already exists.
 */
export function initOpenSpec(projectDir: string): void {
  const openspecPath = path.join(projectDir, OPENSPEC_DIR);

  if (fs.existsSync(openspecPath)) {
    return;
  }

  const dirs = [
    path.join(openspecPath, SPECS_DIR),
    path.join(openspecPath, CHANGES_DIR, ACTIVE_DIR),
    path.join(openspecPath, CHANGES_DIR, ARCHIVE_DIR),
    path.join(openspecPath, SCHEMAS_DIR),
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write a SpecDoc to `openspec/specs/<spec.module>.md`.
 */
export function writeSpec(openspecPath: string, spec: SpecDoc): void {
  const specsDir = path.join(openspecPath, SPECS_DIR);
  ensureDir(specsDir);

  const fileName = `${spec.module}.md`;
  const filePath = path.join(specsDir, fileName);

  const lines: string[] = [];

  // Title
  lines.push(`# Module: ${spec.title}`);
  lines.push("");

  // Overview
  lines.push("## Overview");
  lines.push("");
  lines.push(spec.description);
  lines.push("");

  // Classes
  if (spec.classes.length > 0) {
    lines.push("## Classes");
    lines.push("");
    for (const cls of spec.classes) {
      lines.push(`### ${cls.name} — ${cls.description}`);
      lines.push("");
    }
  }

  // API
  if (spec.apis.length > 0) {
    lines.push("## API");
    lines.push("");
    for (const api of spec.apis) {
      lines.push(`### ${api.signature} — ${api.description}`);
      lines.push("");
    }
  }

  // Dependencies
  lines.push("## Dependencies");
  lines.push("");
  for (const dep of spec.dependencies) {
    lines.push(`- ${dep}`);
  }
  lines.push("");

  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

/**
 * Write a SchemaDoc to `openspec/schemas/<schema.table>.md`.
 */
export function writeSchema(openspecPath: string, schema: SchemaDoc): void {
  const schemasDir = path.join(openspecPath, SCHEMAS_DIR);
  ensureDir(schemasDir);

  const fileName = `${schema.table}.md`;
  const filePath = path.join(schemasDir, fileName);

  const lines: string[] = [];

  // Title
  lines.push(`# Schema: ${schema.title}`);
  lines.push("");

  // Columns
  lines.push("## Columns");
  lines.push("");
  lines.push("| Name | Type | Nullable | Description |");
  lines.push("|------|------|----------|-------------|");

  for (const col of schema.columns) {
    const nullable = col.nullable === true ? "YES" : "NO";
    const description = col.description ?? "";
    lines.push(`| ${col.name} | ${col.type} | ${nullable} | ${description} |`);
  }

  lines.push("");

  // Relations
  if (schema.relations.length > 0) {
    lines.push("## Relations");
    lines.push("");
    for (const rel of schema.relations) {
      lines.push(`- **${rel.target}** — ${rel.type} via \`${rel.via}\``);
    }
    lines.push("");
  }

  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

/**
 * Create a new change folder under `openspec/changes/active/<name>/`
 * with a `proposal.md` skeleton.  Returns the full path to the created folder.
 */
export function createChangeFolder(openspecPath: string, name: string): string {
  const activeDir = path.join(openspecPath, CHANGES_DIR, ACTIVE_DIR);
  const changeDir = path.join(activeDir, name);

  ensureDir(changeDir);

  const proposalPath = path.join(changeDir, PROPOSAL_FILE);
  const proposalContent = [
    `# Change: ${name}`,
    "",
    "## Motivation",
    "",
    "## Approach",
    "",
    "## Tasks",
    "",
  ].join("\n");

  fs.writeFileSync(proposalPath, proposalContent, "utf-8");

  return changeDir;
}

/**
 * Archive a change by moving `openspec/changes/active/<name>/` to
 * `openspec/changes/archive/<name>/`.
 */
export function archiveChange(openspecPath: string, name: string): void {
  const activeDir = path.join(openspecPath, CHANGES_DIR, ACTIVE_DIR);
  const archiveDir = path.join(openspecPath, CHANGES_DIR, ARCHIVE_DIR);
  const sourceDir = path.join(activeDir, name);
  const targetDir = path.join(archiveDir, name);

  if (!fs.existsSync(sourceDir)) {
    throw new Error(
      `Cannot archive "${name}": folder does not exist at ${sourceDir}`,
    );
  }

  ensureDir(archiveDir);
  fs.renameSync(sourceDir, targetDir);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Like mkdir -p -- no error when the directory already exists. */
function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
