---
name: sdd-codegraph
description: Index project code with CodeGraph and verify index health — the graph database backing SDD's module detection and dependency analysis
type: init
---

# SDD CodeGraph

## Purpose

Installs and runs CodeGraph CLI (`@colbymchenry/codegraph`) against the project, producing a `.codegraph/` index directory. This graph database is the foundation for module detection, dependency edge analysis, call-graph queries, and entry-point detection. Without a healthy CodeGraph index, SDD falls back to directory-scanning heuristics.

## When to Use

- After `sdd init` with `--depth quick` (which skips indexing) and you want to add indexing later
- When `sdd doctor` reports "CodeGraph index not found"
- When `sdd status` shows `indexed: false`
- After a large refactor that invalidates the old index — delete `.codegraph/` and re-run
- When you want to use `sdd init --skip openspec,obsidian,constitution` to focus on indexing only

## Instructions

1. **Check CodeGraph availability** -- `npx @colbymchenry/codegraph --version`. If not installed, the tool will pull it via `npx` automatically. No global install is needed.

2. **Verify the project has a `.git` directory** -- CodeGraph requires git for file tracking. If absent, the tool will warn but continue; indexing will fail with a clear error message from CodeGraph.

3. **Run CodeGraph index** -- execute `npx @colbymchenry/codegraph index` inside the project root. The SDD CLI does this automatically during `sdd init` Phase 2/4 for `--depth standard` or `--depth deep`. You can also run it manually:
   ```bash
   cd /path/to/project
   npx @colbymchenry/codegraph index
   ```

4. **Verify the index** -- check that `.codegraph/` exists and is non-empty:
   ```bash
   ls -la .codegraph/
   ```
   The `isIndexed()` function in `cli/src/integrations/codegraph.ts` checks for directory existence and non-emptiness.

5. **Validate index health via SDD** -- run `sdd status` and confirm `Indexed: Yes`. Run `sdd doctor` and confirm `CodeGraph index found` check passes.

6. **Query modules (when available)** -- once CodeGraph MCP querying is implemented (currently stubbed), you will be able to run:
   ```bash
   sdd status --json | jq '.codegraph'
   ```
   For now, module discovery falls back to scanning `src/`, `lib/`, `app/`, `source/` directories.

## Commands Used

- `npx @colbymchenry/codegraph --version` -- verify CodeGraph is reachable (15s timeout)
- `npx @colbymchenry/codegraph index` -- index the project (5-minute timeout)
- `sdd init . --depth deep` -- initialize with deep indexing
- `sdd init . --skip openspec,obsidian,constitution` -- index only, skip other outputs

## Output

- `.codegraph/` -- CodeGraph index directory containing the serialized graph database
- `sdd status` reports: `indexed: true`, index size in human-readable bytes
- `sdd doctor` reports: `CodeGraph installed` and `CodeGraph index found` as pass/fail checks

## Troubleshooting

- **"CodeGraph not installed"**: the `npx` command timed out (15s). Check network connectivity and npm registry access.
- **"CodeGraph index failed"**: the `codegraph index` command returned non-zero. Check `stderr` output. Common causes: missing `.git`, empty project, or permission issues.
- **Index exists but modules are empty**: the CodeGraph MCP query surface is not yet implemented. SDD uses a directory-scanning fallback (`getModulesFallback()`) that walks `src/`, `lib/`, `app/`, `source/`.
- **5-minute timeout**: large projects may need longer. The timeout is configured in `INDEX_TIMEOUT_MS` constant in `cli/src/integrations/codegraph.ts`.

## Architecture Note

CodeGraph integration lives in `cli/src/integrations/codegraph.ts`. Key functions:
- `isInstalled()` -- checks `npx @colbymchenry/codegraph --version`
- `isIndexed(projectDir)` -- checks `.codegraph/` exists and is non-empty
- `indexProject(projectDir)` -- runs `npx @colbymchenry/codegraph index`
- `getModules(projectDir)` -- tries CodeGraph query, falls back to directory scan
- `getDependencies(projectDir)` -- **stub**, returns `[]` until MCP query is wired
- `getCallGraph(projectDir, symbol)` -- **stub**, returns `[]`
- `getEntryPoints(projectDir)` -- scans for `index.*`, `main.*`, `app.*`, `server.*` patterns across well-known source directories
