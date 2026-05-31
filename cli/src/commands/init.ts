import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";

import { saveConfig, DEFAULT_CONFIG } from "../config.js";
import type { SddConfig } from "../config.js";

import {
  detectLanguages,
  detectSrcDir,
  detectProjectName,
} from "../analyzers/language.js";
import { analyzeModules, assessHealth } from "../analyzers/structure.js";
import type { ModuleTopology } from "../analyzers/structure.js";

import {
  isInstalled,
  isIndexed,
  indexProject,
  getModules,
} from "../integrations/codegraph.js";
import type { ModuleInfo } from "../integrations/codegraph.js";
import { initOpenSpec } from "../integrations/openspec.js";
import { initVault } from "../integrations/obsidian.js";
import type { VaultStrategy } from "../integrations/obsidian.js";

import { generateModuleSpecs, generateSchemas } from "../generators/specs.js";
import { generateModuleNotes, generateIndexNote } from "../generators/vault.js";
import { writeConstitution } from "../generators/constitution.js";

import * as logger from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InitOptions {
  lang?: string;
  vault?: string;
  vaultStrategy?: string;
  depth?: string;
  skip?: string;
  dryRun?: boolean;
  force?: boolean;
}

interface PipelineResult {
  projectDir: string;
  projectName: string;
  languages: string[];
  srcDir: string;
  topology: ModuleTopology;
  healthScore: number;
  generated: string[];
  errors: string[];
}

type Depth = "quick" | "standard" | "deep";

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const VALID_DEPTHS: ReadonlySet<string> = new Set(["quick", "standard", "deep"]);
const VALID_STRATEGIES: ReadonlySet<string> = new Set(["embedded", "standalone", "hybrid"]);

function validateDepth(raw: string): Depth {
  if (!VALID_DEPTHS.has(raw)) {
    throw new Error(`Invalid depth "${raw}". Must be: quick, standard, or deep.`);
  }
  return raw as Depth;
}

function validateStrategy(raw: string): VaultStrategy {
  if (!VALID_STRATEGIES.has(raw)) {
    throw new Error(
      `Invalid vault strategy "${raw}". Must be: embedded, standalone, or hybrid.`,
    );
  }
  return raw as VaultStrategy;
}

function parseSkipSteps(raw?: string): ReadonlySet<string> {
  if (!raw || raw.trim().length === 0) {
    return new Set();
  }
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

function isGitRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, ".git"));
}

// ---------------------------------------------------------------------------
// Pipeline phases
// ---------------------------------------------------------------------------

interface DetectResult {
  projectName: string;
  languages: string[];
  srcDir: string;
}

function runDetectPhase(projectDir: string, langOverride?: string): DetectResult {
  const languages = langOverride
    ? [langOverride]
    : detectLanguages(projectDir);

  const srcDir = detectSrcDir(projectDir);
  const projectName = detectProjectName(projectDir);

  return { projectName, languages, srcDir };
}

async function runIndexPhase(
  projectDir: string,
  depth: Depth,
): Promise<void> {
  if (depth === "quick") {
    logger.info("  Depth is quick, skipping CodeGraph indexing.");
    return;
  }

  const installed = await isInstalled();
  if (!installed) {
    logger.warn("  CodeGraph not installed; skipping indexing. Module detection will use fallback.");
    return;
  }
  logger.info("  CodeGraph installed.");

  const alreadyIndexed = await isIndexed(projectDir);
  if (alreadyIndexed) {
    logger.info("  Project already indexed; skipping.");
    return;
  }

  logger.info("  Indexing project...");
  const result = await indexProject(projectDir);
  if (!result.success) {
    logger.warn(`  CodeGraph index failed: ${result.output}. Module detection will use fallback.`);
    return;
  }
  logger.success("  Indexing complete.");
}

async function runAnalyzePhase(
  projectDir: string,
): Promise<ModuleTopology> {
  let modules: ModuleInfo[] = [];
  try {
    modules = await getModules(projectDir);
  } catch (err) {
    logger.warn(
      `  Module detection failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return analyzeModules(projectDir, modules);
}

// ---------------------------------------------------------------------------
// Public API — the core orchestrator (exported for testing)
// ---------------------------------------------------------------------------

export async function runInit(
  targetDir: string,
  options: InitOptions,
): Promise<PipelineResult> {
  const errors: string[] = [];
  const generated: string[] = [];

  const projectDir = path.resolve(targetDir);
  const skipSteps = parseSkipSteps(options.skip);
  const depth = validateDepth(options.depth ?? "standard");
  const vaultStrategy = validateStrategy(options.vaultStrategy ?? "hybrid");
  const vaultPathInput = options.vault ?? "sdd-vault";
  const isDryRun = options.dryRun === true;
  const isForce = options.force === true;

  // ------------------------------------------------------------------
  // Pre-flight checks
  // ------------------------------------------------------------------
  if (!isGitRepo(projectDir)) {
    logger.warn("Not a git repository. CodeGraph requires git, but other features will work.");
  }

  const configPath = path.join(projectDir, ".sdd-exoskeleton", "config.json");
  if (fs.existsSync(configPath) && !isForce) {
    logger.error("SDD Exoskeleton is already initialized. Use --force to overwrite.");
    return {
      projectDir,
      projectName: "",
      languages: [],
      srcDir: "",
      topology: { modules: [], edges: [], entryPoints: [] },
      healthScore: 0,
      generated,
      errors: ["Config already exists. Use --force to overwrite."],
    };
  }

  // ------------------------------------------------------------------
  // Phase 1: Detect
  // ------------------------------------------------------------------
  logger.step("Phase 1/4: Detecting project...");

  let detectResult: DetectResult;
  try {
    detectResult = runDetectPhase(projectDir, options.lang);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Detection failed: ${message}`);
    logger.error(`Detection failed: ${message}`);
    detectResult = {
      projectName: path.basename(projectDir),
      languages: [],
      srcDir: ".",
    };
  }

  const { projectName, languages, srcDir } = detectResult;

  logger.info(`  Project name: ${projectName || "(unknown)"}`);
  logger.info(
    `  Languages: ${languages.length > 0 ? languages.join(", ") : "none detected"}`,
  );
  logger.info(`  Source dir: ${srcDir}`);

  // ------------------------------------------------------------------
  // Phase 2: Index
  // ------------------------------------------------------------------
  logger.step("Phase 2/4: Indexing with CodeGraph...");

  if (skipSteps.has("codegraph")) {
    logger.info("  CodeGraph step skipped (--skip includes codegraph).");
  } else {
    try {
      await runIndexPhase(projectDir, depth);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Indexing failed: ${message}`);
      logger.warn(`  Indexing error: ${message}. Continuing with fallback module detection.`);
    }
  }

  // ------------------------------------------------------------------
  // Phase 3: Analyze
  // ------------------------------------------------------------------
  logger.step("Phase 3/4: Analyzing structure...");

  let topology: ModuleTopology = { modules: [], edges: [], entryPoints: [] };

  try {
    topology = await runAnalyzePhase(projectDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Analysis failed: ${message}`);
    logger.warn(`  Analysis error: ${message}. Continuing.`);
  }

  logger.info(`  Modules detected: ${topology.modules.length}`);
  logger.info(
    `  Dependencies: ${topology.edges.length}${topology.edges.length === 0 ? " (CodeGraph dependency query not yet implemented)" : ""}`,
  );
  logger.info(`  Entry points: ${topology.entryPoints.length}`);

  const healthReport = assessHealth(topology);
  const healthScore = healthReport.score;
  logger.info(`  Health score: ${healthScore}/100`);

  if (healthReport.issues.length > 0) {
    for (const issue of healthReport.issues) {
      logger.warn(`    - ${issue}`);
    }
  } else {
    logger.success("  No structural issues found.");
  }

  // ------------------------------------------------------------------
  // Phase 4: Generate
  // ------------------------------------------------------------------
  logger.step("Phase 4/4: Generating files...");

  const config: SddConfig = {
    ...structuredClone(DEFAULT_CONFIG),
    project: {
      name: projectName,
      languages,
      rootDir: projectDir,
      srcDir,
    },
    obsidian: {
      ...structuredClone(DEFAULT_CONFIG.obsidian),
      vaultPath: vaultPathInput,
      strategy: vaultStrategy,
    },
  };

  const openspecDir = path.join(projectDir, "openspec");

  // Determine raw vault path based on strategy (immutable)
  const rawVaultPath = vaultStrategy === "embedded"
    ? projectDir
    : vaultStrategy === "standalone"
      ? path.resolve(vaultPathInput)
      : path.join(projectDir, "sdd-vault");

  if (isDryRun) {
    // In dry-run mode, log every action without writing files
    logger.dryRun(`Would save config to ${configPath}`);
    generated.push(`[DRY RUN] config: ${configPath}`);

    if (!skipSteps.has("openspec")) {
      logger.dryRun(`Would init OpenSpec at ${openspecDir}`);
      logger.dryRun(`Would generate module specs (${topology.modules.length} modules)`);
      logger.dryRun(`Would generate schemas`);
      generated.push(`[DRY RUN] openspec: ${openspecDir}`);
    }

    if (!skipSteps.has("obsidian")) {
      logger.dryRun(`Would init vault at ${rawVaultPath}`);
      logger.dryRun(`Would generate ${topology.modules.length} module notes`);
      logger.dryRun(`Would generate index note`);
      generated.push(`[DRY RUN] vault: ${rawVaultPath}`);
    }

    if (!skipSteps.has("constitution")) {
      logger.dryRun("Would write CLAUDE.md + AGENTS.md");
      generated.push("[DRY RUN] CLAUDE.md + AGENTS.md");
    }
  } else {
    // -- Save config
    try {
      saveConfig(projectDir, config);
      logger.success(`Config saved to ${configPath}`);
      generated.push(configPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to save config: ${message}`);
      logger.error(`Failed to save config: ${message}`);
    }

    // -- OpenSpec
    if (!skipSteps.has("openspec")) {
      try {
        initOpenSpec(projectDir);
        logger.success(`OpenSpec initialized at ${openspecDir}`);
        generated.push(openspecDir);

        generateModuleSpecs(topology, openspecDir);
        logger.success(
          `Module specs generated (${topology.modules.length} modules) in ${path.join(openspecDir, "specs", "modules")}`,
        );

        generateSchemas(openspecDir);
        logger.success(`Schemas generated in ${path.join(openspecDir, "schemas")}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`OpenSpec generation failed: ${message}`);
        logger.error(`OpenSpec generation failed: ${message}`);
      }
    } else {
      logger.info("  OpenSpec step skipped (--skip includes openspec).");
    }

    // -- Obsidian Vault
    if (!skipSteps.has("obsidian")) {
      try {
        const resolvedVaultPath = initVault(
          vaultStrategy === "standalone" ? rawVaultPath : projectDir,
          vaultStrategy,
        );

        logger.success(`Vault initialized at ${resolvedVaultPath}`);
        generated.push(resolvedVaultPath);

        generateModuleNotes(topology.modules, resolvedVaultPath);
        logger.success(
          `Module notes generated (${topology.modules.length}) in ${path.join(resolvedVaultPath, "modules")}`,
        );

        generateIndexNote(topology, resolvedVaultPath);
        logger.success(`Index note generated at ${path.join(resolvedVaultPath, "index.md")}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Obsidian vault generation failed: ${message}`);
        logger.error(`Obsidian vault generation failed: ${message}`);
      }
    } else {
      logger.info("  Obsidian step skipped (--skip includes obsidian).");
    }

    // -- CLAUDE.md + AGENTS.md
    if (!skipSteps.has("constitution")) {
      try {
        const result = writeConstitution(projectDir, config, topology);
        for (const filePath of result.written) {
          logger.success(`Written: ${filePath}`);
          generated.push(filePath);
        }
        for (const filePath of result.skipped) {
          logger.warn(`Skipped (no sdd marker): ${filePath}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Constitution generation failed: ${message}`);
        logger.error(`Constitution generation failed: ${message}`);
      }
    } else {
      logger.info("  Constitution step skipped (--skip includes constitution).");
    }
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  logger.title("SDD Exoskeleton initialization complete.");

  if (errors.length > 0) {
    logger.warn(`${errors.length} error(s) encountered:`);
    for (const err of errors) {
      logger.error(`  ${err}`);
    }
  }

  return {
    projectDir,
    projectName,
    languages,
    srcDir,
    topology,
    healthScore,
    generated,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Commander command factory
// ---------------------------------------------------------------------------

export function initCommand(): Command {
  return new Command("init")
    .description("Initialize SDD Exoskeleton in a project directory")
    .argument("[path]", "project directory path")
    .option("--lang <lang>", "force specific language instead of auto-detect")
    .option("--vault <path>", "Obsidian vault path", "./sdd-vault")
    .option(
      "--vault-strategy <mode>",
      "vault strategy: embedded | standalone | hybrid",
      "hybrid",
    )
    .option("--depth <level>", "analysis depth: quick | standard | deep", "standard")
    .option(
      "--skip <steps>",
      "comma-separated steps to skip: codegraph,openspec,obsidian,constitution",
    )
    .option("--dry-run", "print actions without writing files")
    .option("--force", "overwrite existing config and files")
    .action(async (targetPath: string | undefined, options: InitOptions) => {
      const resolved = targetPath ?? process.cwd();
      await runInit(resolved, options);
    });
}
