---
name: sdd-refactor
description: Execute a refactoring with SDD guardrails — identify target, generate a change proposal, apply refactoring, verify tests pass, and sync specs + vault
type: evolution
---

# SDD Refactor

## Purpose

Guides a refactoring through the SDD workflow with guardrails that prevent regressions. Before touching code, the skill identifies the target modules, generates a change proposal that documents the before/after structure, checks architectural boundaries for violations, applies the refactoring using TDD (tests first, then implementation), verifies all tests still pass, and syncs the updated structure to OpenSpec specs and the Obsidian vault.

## When to Use

- Extracting a module from a god module (>50 exports detected by `sdd analyze`)
- Resolving a circular dependency reported by the health check
- Flattening deeply nested files (>4 levels)
- Renaming or reorganizing modules
- Pulling shared logic into a utility or library
- Any structural change that alters the module topology

## Instructions

1. **Identify the target** -- use `sdd status` and the analysis from `sdd init` Phase 3/4 to find structural issues:
   - God modules: listed in health report as `god module "X" has >50 exports`
   - Circular dependencies: listed as `circular dependency: A -> B -> A`
   - Orphans: listed as `orphan module "X" has no incoming or outgoing dependencies`
   - Deep nesting: listed as `deep-nested file "X" is more than 4 levels deep`

2. **Generate a change proposal** -- create `openspec/changes/active/<refactor-name>/proposal.md` with:
   - **Motivation**: which structural issue this addresses (link to the health report)
   - **Approach**: before/after module structure diagram
   - **Tasks**: step-by-step breakdown including test updates, implementation, and spec updates
   - **Affected Specs**: list of `openspec/specs/modules/<name>.md` files that need updating

3. **Check architectural boundaries** -- run sdd-arch-guard to verify the refactoring does not introduce boundary violations:
   - If extracting a module, verify it stays within its boundary
   - If moving between boundaries, ensure the cross-boundary dependencies are intentional
   - If creating a new boundary, document it in the boundary map

4. **Apply the refactoring (TDD)**:
   - **Write tests first** for the new module structure (RED phase)
   - **Update imports** in dependent modules to reference the new locations
   - **Extract/move** the code to the new module structure
   - **Run tests** until they pass (GREEN phase)
   - **Refine** the extracted code for clarity and small file size (IMPROVE phase)

5. **Verify tests pass** -- run the full test suite:
   ```bash
   # For TypeScript/JavaScript projects
   npx vitest run
   # For Python projects
   python -m pytest
   # etc.
   ```
   Confirm coverage >= 80% for changed modules.

6. **Sync specs and vault**:
   - Run `sdd sync` to detect all changed files and generate a delta
   - Review the auto-generated delta at `openspec/changes/<timestamp>-sync/proposal.md`
   - Manually update any spec that was hand-edited (no auto-generation marker)
   - Verify the module notes in `sdd-vault/modules/` reflect the new structure
   - Rebuild the vault index: `sdd vault rebuild`

7. **Run final health check** -- `sdd doctor` and `sdd status` should show:
   - No stale sync entries
   - Health score improved (fewer or no structural issues)
   - All checks passing

## Commands Used

- `sdd status` -- view current topology and issues
- `sdd sync` -- detect changes and update sync state
- `sdd doctor` -- verify SDD subsystem health
- `sdd vault rebuild` -- regenerate vault notes from current topology
- (sdd-arch-guard) -- check boundary violations
- (sdd-propose) -- formalize the refactoring as a change proposal

## Guardrails

- **Never mutate existing objects** -- create new module files, then update imports, then remove old files
- **One refactoring at a time** -- each change proposal should address exactly one structural issue
- **Tests must pass before and after** -- if tests were failing before the refactor, fix them in a separate change
- **Specs drive the structure** -- if the spec says module X exposes API Y, the refactored code must still expose it (or the spec must be updated first)

## Example: Extracting a God Module

```
Before:
  src/utils/
    helpers.ts (80 exports, god module)

After:
  src/utils/
    helpers.ts (30 exports)
  src/utils/string/
    string-utils.ts (25 exports, extracted from helpers)
  src/utils/date/
    date-utils.ts (25 exports, extracted from helpers)
```

Steps:
1. Write tests for `string-utils.ts` and `date-utils.ts` (RED)
2. Create the new files, extract functions (GREEN)
3. Update imports in all files that used `helpers.ts`
4. Remove extracted functions from `helpers.ts`
5. Run full test suite, confirm coverage
6. `sdd sync` to update specs and vault
7. Archive the change
