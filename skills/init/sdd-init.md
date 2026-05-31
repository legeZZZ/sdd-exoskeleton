---
name: sdd-init
description: Initialize SDD Exoskeleton on a legacy project — detect languages, index with CodeGraph, generate specs + Obsidian vault + CLAUDE.md
type: init
---

# SDD Init

## Purpose

Bootstraps the full SDD Exoskeleton on an existing project. Runs four phases: detect (language/name/srcDir), index (CodeGraph), analyze (module topology + health score), and generate (OpenSpec specs, Obsidian vault, CLAUDE.md + AGENTS.md constitution). The result is a fully instrumented project ready for spec-driven development.

## When to Use

- First time adding SDD to a legacy codebase that has no `.sdd-exoskeleton/config.json`
- After deleting the SDD config and wanting a fresh initialization
- When you want to force-overwrite an existing SDD setup with `--force`

## Instructions

1. **Verify preconditions** -- ensure you are in a git repository (CodeGraph requires `.git`, but the tool will warn and continue if absent). Run `sdd status` first if unsure whether SDD is already initialized.

2. **Run `sdd init`** with the appropriate options:
   - `sdd init` -- standard depth, auto-detect languages, hybrid vault
   - `sdd init . --lang typescript` -- force a specific language
   - `sdd init . --depth deep` -- deep analysis (includes CodeGraph indexing)
   - `sdd init . --vault-strategy standalone --vault ~/vaults/my-project` -- standalone vault outside project
   - `sdd init . --skip codegraph,constitution` -- skip specific generation steps
   - `sdd init . --dry-run` -- preview without writing any files
   - `sdd init . --force` -- overwrite existing config

3. **Review phase output** -- watch the 4-phase progress:
   - Phase 1/4: Detects project name, languages, source directory
   - Phase 2/4: Installs and runs CodeGraph index (skipped in `--depth quick`)
   - Phase 3/4: Analyzes module structure, reports health score (0-100) and issues (circular deps, god modules, orphans, deep nesting)
   - Phase 4/4: Generates OpenSpec specs under `openspec/specs/modules/`, Obsidian vault at `sdd-vault/` (or custom path), and CLAUDE.md + AGENTS.md

4. **Verify initialization** -- run `sdd status` and `sdd doctor` to confirm all subsystems are healthy.

## Commands Used

- `sdd init [path]` -- initialize SDD Exoskeleton (default: current directory)
- `sdd init [path] --lang <lang>` -- force language: typescript, python, go, rust, java, kotlin, ruby, php, csharp, c, cpp, swift
- `sdd init [path] --depth <level>` -- analysis depth: quick (skip indexing), standard (index + analyze), deep (full graph)
- `sdd init [path] --vault <path>` -- Obsidian vault path (default: `./sdd-vault`)
- `sdd init [path] --vault-strategy <mode>` -- embedded | standalone | hybrid
- `sdd init [path] --skip <steps>` -- comma-separated: codegraph, openspec, obsidian, constitution
- `sdd init [path] --dry-run` -- print actions without writing files
- `sdd init [path] --force` -- overwrite existing config and files

## Output

- `.sdd-exoskeleton/config.json` -- project configuration (languages, paths, vault strategy, sync mode)
- `openspec/` -- OpenSpec directory tree: `specs/`, `changes/active/`, `changes/archive/`, `schemas/`
- `openspec/specs/modules/<module>.md` -- one spec per detected module
- `openspec/schemas/placeholder.schema.md` -- stub schema to be populated later
- `sdd-vault/` (or custom path) -- Obsidian vault with `modules/`, `apis/`, `data/`, `journal/`, `decisions/`, `templates/`
- `sdd-vault/modules/<module>.md` -- Obsidian note per module with YAML frontmatter
- `sdd-vault/index.md` -- Map of Content with [[wikilinks]]
- `CLAUDE.md` -- project constitution with module map, tech stack, and SDD workflow
- `AGENTS.md` -- AI agent instructions with project context and SDD commands
- `.sdd-exoskeleton/sync-state.json` -- empty initial sync state

The init pipeline returns a summary with health score, number of modules detected, dependency edges, entry points, and the list of generated files.
