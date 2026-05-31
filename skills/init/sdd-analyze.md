---
name: sdd-analyze
description: Analyze project structure, detect module topology, and report architecture health — identifies circular deps, god modules, orphans, and deep nesting
type: init
---

# SDD Analyze

## Purpose

Analyzes the project's module structure to produce a topology graph (modules, dependency edges, entry points) and a health score from 0-100. Detects four categories of structural issues: circular dependencies (-20 each), god modules with >50 exports (-15 each), orphan modules with no incoming/outgoing deps (-10 each), and deeply nested files >4 levels (-5 each). This analysis drives spec generation and vault content.

## When to Use

- Understanding the architecture of a legacy codebase before beginning a refactor
- After a large merge or reorganization to check for regressions in module health
- As part of an SDD evolution cycle, before proposing changes that cross module boundaries
- When `sdd doctor` reports sync state inconsistencies that may stem from structural issues
- Before running `sdd init` to preview what would be detected (use `--dry-run`)

## Instructions

1. **Detect languages** -- the analyzer first determines what programming languages are used. It checks for project config files: `package.json` (JS/TS), `go.mod` (Go), `Cargo.toml` (Rust), `pyproject.toml` (Python), `pom.xml`/`build.gradle` (Java/Kotlin), `Gemfile` (Ruby), `composer.json` (PHP), `*.csproj` (C#), `CMakeLists.txt` (C/C++), `Package.swift` (Swift). Override with `--lang <language>`.

2. **Detect source directory** -- checks for `src/`, `lib/`, `app/`, `main/` in order, falling back to `.` (project root).

3. **Index with CodeGraph** (optional but recommended) -- run `sdd init . --depth deep` or manually run `npx @colbymchenry/codegraph index`. Without an index, module discovery falls back to scanning known source directories.

4. **Analyze module topology** -- the `analyzeModules()` function in `cli/src/analyzers/structure.ts`:
   - Groups files into modules by directory (e.g., `src/auth/`, `src/db/`)
   - Queries dependency edges from CodeGraph (currently stubbed)
   - Identifies entry points by matching filenames against `index.*`, `main.*`, `app.*`, `server.*`, `cli.*`, `bin.*` patterns

5. **Assess health** -- the `assessHealth()` function computes a score and reports issues:
   - **Circular dependencies**: DFS-based cycle detection on the dependency graph. Reports paths like `auth -> db -> auth`.
   - **God modules**: modules with >50 exports (threshold: `GOD_MODULE_EXPORT_THRESHOLD`)
   - **Orphan modules**: modules not referenced by any dependency edge
   - **Deep nesting**: files nested >4 directory levels under source (threshold: `DEEP_NEST_THRESHOLD`)

6. **Review the report** -- `sdd init` prints the health score and any issues during Phase 3/4. Fix CRITICAL structural issues before generating specs.

## Commands Used

- `sdd init . --dry-run` -- preview analysis without writing files
- `sdd init . --lang <lang>` -- force language detection
- `sdd init . --depth deep` -- ensure CodeGraph indexing runs for accurate dependency edges
- `sdd status` -- view current topology summary (module count, entry point count)

## Output

The analyzer produces (`ModuleTopology`):
- `modules: ModuleInfo[]` -- each with `name`, `path`, `files`, `exports`
- `edges: DepEdge[]` -- each with `source`, `target`, `type` (import | call | data)
- `entryPoints: string[]` -- file paths matching entry-point patterns
- `healthScore: number` -- 0-100, starting at 100 and decrementing per issue
- `issues: string[]` -- human-readable descriptions of each structural problem

## Architecture Boundaries

After analysis, `identifyBoundaries()` groups modules by their top-level directory under a source dir:
- `src/auth/` -> boundary "auth"
- `src/db/` -> boundary "db"
- `src/index.ts` -> boundary "root"

`identifyCoreApis()` finds exports that cross these boundaries, which forms the basis for the arch-guard skill.

## Code Location

- Language detection: `cli/src/analyzers/language.ts` (13 language configs, each with extensions + linter + formatter + style guide)
- Structure analysis: `cli/src/analyzers/structure.ts` (topology, boundaries, health scoring, cycle detection)
- Module discovery: `cli/src/integrations/codegraph.ts` (CodeGraph query + directory-scan fallback)
